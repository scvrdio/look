import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

function verifyTelegramInitData(initData: string, botToken: string) {
    const params = new URLSearchParams(initData);

    const hash = params.get("hash");
    if (!hash) return { ok: false as const, reason: "missing hash" };

    // соберём объект без hash
    const data: Record<string, string> = {};
    params.forEach((value, key) => {
        if (key !== "hash") data[key] = value;
    });

    const authDateStr = data["auth_date"]; // или params.get("auth_date") — смотря как у тебя собрано
    if (!authDateStr) return { ok: false as const, reason: "missing auth_date" };

    const authDate = Number(authDateStr);
    if (!Number.isFinite(authDate)) return { ok: false as const, reason: "bad auth_date" };

    const now = Math.floor(Date.now() / 1000);
    const MAX_AGE_SECONDS = 60 * 60 * 24; // 24 часа

    if (now - authDate > MAX_AGE_SECONDS) {
        return { ok: false as const, reason: "initData expired" };
    }


    const dataCheckString = Object.keys(data)
        .sort()
        .map((k) => `${k}=${data[k]}`)
        .join("\n");

    const secretKey = crypto
        .createHmac("sha256", "WebAppData")
        .update(botToken.trim())
        .digest();

    const computedHash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

    if (computedHash !== hash) {
        return { ok: false as const, reason: "hash mismatch" };
    }

    const userRaw = data["user"];
    if (!userRaw) return { ok: false as const, reason: "missing user" };

    let user: any;
    try {
        user = JSON.parse(userRaw);
    } catch {
        return { ok: false as const, reason: "bad user json" };
    }

    const telegramId = user?.id;
    if (!telegramId) return { ok: false as const, reason: "missing telegram id" };

    return { ok: true as const, telegramId: BigInt(telegramId) };
}


export async function POST(req: Request) {
    const { initData } = (await req.json().catch(() => ({}))) as {
        initData?: string;
    };

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        return NextResponse.json(
            { error: "TELEGRAM_BOT_TOKEN is not set" },
            { status: 500 }
        );
    }

    if (!initData || typeof initData !== "string") {
        return NextResponse.json({ error: "initData is required" }, { status: 400 });
    }

    const v = verifyTelegramInitData(initData, botToken);
    if (!v.ok) {
        return NextResponse.json({ error: "unauthorized", reason: v.reason }, { status: 401 });
    }

    const user = await prisma.user.upsert({
        where: { telegramId: v.telegramId },
        update: {},
        create: { telegramId: v.telegramId },
        select: { id: true },
    });

    const res = NextResponse.json({ ok: true });

    // httpOnly cookie с внутренним userId
    res.cookies.set("uid", user.id, {
        httpOnly: true,
        secure: true,      // на Vercel всегда https
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 дней
    });

    return res;
}
