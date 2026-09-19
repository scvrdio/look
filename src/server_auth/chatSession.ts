import crypto from "crypto";

function sessionSecret() {
  return process.env.SESSION_SECRET
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.TELEGRAM_BOT_TOKEN;
}

function signature(chatId: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(chatId).digest("hex");
}

export function createChatSession(chatId: string) {
  const secret = sessionSecret();
  if (!secret) throw new Error("Session signing is not configured");
  return `${chatId}.${signature(chatId, secret)}`;
}

export function verifyChatSession(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d+)\.([a-f0-9]{64})$/.exec(value);
  const secret = sessionSecret();
  if (!match || !secret) return null;

  const expected = Buffer.from(signature(match[1], secret), "hex");
  const received = Buffer.from(match[2], "hex");
  if (!crypto.timingSafeEqual(expected, received)) return null;
  return match[1];
}

