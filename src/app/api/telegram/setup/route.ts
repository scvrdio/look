import { matchesSecret, telegram } from "@/lib/telegram-bot";
export const runtime = "nodejs";
// Temporary operator access; disabled when TELEGRAM_SETUP_SECRET is removed.
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_SETUP_SECRET;
  const expires = Number(process.env.TELEGRAM_SETUP_EXPIRES);
  if (!secret || !expires || Date.now() > expires) return new Response("Not found", { status: 404 });
  if (!matchesSecret(request.headers.get("authorization"), `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  try {
    const me = await telegram<{ username: string }>("getMe");
    if (me.username !== "wellook_bot" || !process.env.TELEGRAM_WEBHOOK_SECRET) return new Response("Configuration mismatch", { status: 409 });
    const url = "https://look-notify.vercel.app";
    await telegram("setWebhook", { url: `${url}/api/telegram`, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"] });
    await telegram("setChatMenuButton", { menu_button: { type: "web_app", text: "Look!", web_app: { url } } });
    const webhook = await telegram<{ url: string; pending_update_count: number }>("getWebhookInfo");
    return Response.json({ bot: me.username, webhook: webhook.url, pending: webhook.pending_update_count });
  } catch { console.error("telegram_setup_failed"); return new Response("Setup failed", { status: 502 }); }
}
