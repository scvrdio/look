import { allSubscriptions, checkSubscriptions, matchesSecret } from "@/lib/telegram-bot";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !matchesSecret(request.headers.get("authorization"), `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await checkSubscriptions(await allSubscriptions(), new URL(request.url).searchParams.get("dryRun") === "1");
    console.info("notification_check_completed", result);
    return Response.json(result, { status: result.failed ? 502 : 200 });
  } catch { console.error("notification_check_failed"); return new Response("Check failed", { status: 502 }); }
}
