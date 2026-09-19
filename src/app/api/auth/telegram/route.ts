import crypto from "crypto";
import { NextResponse } from "next/server";
import { createChatSession } from "@/server_auth/chatSession";
import { getCurrentChatId } from "@/server_auth/getCurrentChatId";
import { isDemoMode } from "@/lib/subscriptions";

type TelegramUserPayload = { id?: string | number };
type Verification =
  | { ok: true; telegramId: string }
  | { ok: false; reason: string };

function verifyTelegramInitData(initData: string, botToken: string): Verification {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false as const, reason: "missing hash" };

  const data: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key !== "hash") data[key] = value;
  });

  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false as const, reason: "bad auth_date" };
  if (authDate > Math.floor(Date.now() / 1000) + 60 || Math.floor(Date.now() / 1000) - authDate > 60 * 60 * 24) {
    return { ok: false as const, reason: "initData expired" };
  }

  const dataCheckString = Object.keys(data).sort().map((key) => `${key}=${data[key]}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken.trim()).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const expected = Buffer.from(computedHash);
  const received = Buffer.from(hash);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { ok: false as const, reason: "hash mismatch" };
  }

  try {
    const user = JSON.parse(data.user ?? "{}") as TelegramUserPayload;
    if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0) return { ok: false as const, reason: "invalid telegram id" };
    return { ok: true as const, telegramId: String(user.id) };
  } catch {
    return { ok: false as const, reason: "bad user json" };
  }
}

export async function GET() {
  const chatId = await getCurrentChatId();
  if (!chatId) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, demo: isDemoMode() });
}

export async function POST(request: Request) {
  const { initData } = (await request.json().catch(() => ({}))) as { initData?: string };
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ error: "Telegram auth is not configured" }, { status: 500 });
  }
  if (!initData || typeof initData !== "string") return NextResponse.json({ error: "initData is required" }, { status: 400 });

  const verification = verifyTelegramInitData(initData, botToken);
  if (!verification.ok) return NextResponse.json({ error: "unauthorized", reason: verification.reason }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("tg_chat_id", createChatSession(verification.telegramId), {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
