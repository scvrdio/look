import { handleUpdate, matchesSecret } from "@/lib/telegram-bot";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!matchesSecret(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) return new Response("Unauthorized", { status: 401 });
  try {
    const body = await request.text();
    if (body.length > 64000) return new Response("Too large", { status: 413 });
    let update;
    try { update = JSON.parse(body); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!update || typeof update !== "object") return new Response("Invalid update", { status: 400 });
    await handleUpdate(update);
    return Response.json({ ok: true });
  } catch { console.error("telegram_update_failed"); return new Response("Telegram processing failed", { status: 500 }); }
}
