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

    const dataCheckString = Object.keys(data)
        .sort()
        .map((k) => `${k}=${data[k]}`)
        .join("\n");

    const secretKey = crypto.createHash("sha256").update(botToken).digest();
    const computedHash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

    console.log("[tg-auth] token head:", botToken.slice(0, 12));
    console.log("[tg-auth] data_check_string:\n" + dataCheckString);
    console.log("[tg-auth] received hash:", hash);
    console.log("[tg-auth] computed hash:", computedHash);

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
