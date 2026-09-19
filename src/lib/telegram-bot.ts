import crypto from "node:crypto";
import { getShow, listSubscriptions, searchShows, supabase, type Subscription } from "./subscriptions";
import { addShow, removeShow } from "./look-store";
import { normalizeTitle, queryVariants, searchScore } from "./bot-search";

export function matchesSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function telegram<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured");
  // Never include request URLs or tokens in error messages.
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), cache: "no-store",
    });
  } catch { throw new Error(`Telegram ${method} connection failed`); }
  const data = await response.json() as { ok: boolean; result: T };
  if (!response.ok || !data.ok) throw new Error(`Telegram ${method} failed (${response.status})`);
  return data.result;
}

const escape = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const origin = "https://look-notify.vercel.app";
export const mainMenu = () => ({ inline_keyboard: [
  [{ text: "Открыть приложение", web_app: { url: origin } }],
  [{ text: "Подписки", callback_data: "subscriptions" }, { text: "Проверить серии", callback_data: "check_now" }],
] });
async function send(chatId: string, text: string, markup?: unknown) {
  return telegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...(markup ? { reply_markup: markup } : {}) });
}
type Episode = { id: number; season: number | null; number: number | null; name: string; airdate: string; airstamp?: string; url?: string };
async function episodes(id: number): Promise<Episode[]> {
  const response = await fetch(`https://api.tvmaze.com/shows/${id}/episodes`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Episode catalogue failed (${response.status})`);
  return response.json();
}
export function airedEpisodes(all: Episode[], now = new Date()) {
  return all.filter(e => e.airdate && (e.airstamp ? Date.parse(e.airstamp) <= now.getTime() : e.airdate <= now.toISOString().slice(0, 10)));
}
export function unseenEpisodes(aired: Episode[], lastId: number | null) {
  if (lastId === null) return aired.slice(-1);
  const index = aired.findIndex(e => e.id === lastId);
  return index < 0 ? aired.slice(-1) : aired.slice(index + 1);
}
const episodeText = (e: Episode) => `${e.season ?? "?"} сезон, ${e.number ?? "спецвыпуск"} серия${e.airdate ? ` (${escape(e.airdate)})` : ""}`;

export async function checkSubscriptions(items: Subscription[], dryRun = false) {
  let sent = 0, pending = 0, failed = 0;
  for (const item of items) {
    try {
      const fresh = unseenEpisodes(airedEpisodes(await episodes(item.showId)), item.lastEpisodeId);
      pending += fresh.length;
      if (dryRun) continue;
      for (const episode of fresh) {
        // Persist only after Telegram confirms delivery. Never mark failed sends delivered.
        await send(item.chatId, `Вышла новая серия!\n<b>${escape(item.showName)}</b>\n${episodeText(episode)}`);
        await supabase(`subscriptions?chat_id=eq.${encodeURIComponent(item.chatId)}&show_id=eq.${item.showId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ last_episode_id: episode.id }),
        });
        sent++;
      }
    } catch { failed++; console.error("notification_check_failed", { showId: item.showId }); }
  }
  return { sent, pending, failed, checked: items.length };
}
export async function allSubscriptions(): Promise<Subscription[]> {
  const result: Subscription[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await supabase<{ chat_id: number; show_id: number; show_name: string; last_episode_id: number | null; created_at: string }[]>(`subscriptions?select=chat_id,show_id,show_name,last_episode_id,created_at&order=chat_id,show_id&limit=500&offset=${offset}`);
    result.push(...rows.map(r => ({ chatId: String(r.chat_id), showId: r.show_id, showName: r.show_name, lastEpisodeId: r.last_episode_id, createdAt: r.created_at })));
    if (rows.length < 500) return result;
  }
}
async function subscriptions(chatId: string) {
  const items = await listSubscriptions(chatId);
  if (!items.length) return send(chatId, "Подписок пока нет", mainMenu());
  return send(chatId, `Твои подписки:\n\n${items.map(s => `<b>${escape(s.showName)}</b>`).join("\n")}`, {
    inline_keyboard: items.slice(0, 50).map(s => [{ text: s.showName.slice(0, 40), callback_data: `status:${s.showId}` }]),
  });
}
async function check(chatId: string) {
  const result = await checkSubscriptions(await listSubscriptions(chatId));
  return send(chatId, result.failed ? "Не все сериалы удалось проверить. Попробуй позже." : result.sent ? `Отправлено уведомлений: ${result.sent}` : "Проверил. Новых серий пока нет.", mainMenu());
}
async function status(chatId: string, id: number, schedule = false) {
  const item = (await listSubscriptions(chatId)).find(s => s.showId === id);
  if (!item) return send(chatId, "Подписка не найдена", mainMenu());
  const all = await episodes(id), last = airedEpisodes(all).at(-1);
  const text = schedule ? all.filter(e => e.season === (last?.season ?? all.at(-1)?.season)).map(episodeText).join("\n") : last ? episodeText(last) : "Вышедших серий пока не найдено";
  return send(chatId, `<b>${escape(item.showName)}</b>\n\n${text.slice(0, 3500)}`, { inline_keyboard: [
    [{ text: schedule ? "Назад" : "График серий", callback_data: `${schedule ? "status" : "schedule"}:${id}` }],
    [{ text: "Отписаться", callback_data: `unsubscribe:${id}` }],
  ] });
}
async function search(chatId: string, query: string) {
  if (!query.trim()) return send(chatId, "Напиши название сериала", mainMenu());
  const existing = await listSubscriptions(chatId);
  const match = existing.map(item => ({ item, score: searchScore(query, item.showName) })).sort((a, b) => b.score - a.score).find(x => x.score >= 0.72)?.item;
  if (match) return status(chatId, match.showId);
  let shows: Awaited<ReturnType<typeof searchShows>> = [];
  for (const variant of queryVariants(query.slice(0, 120))) {
    shows = await searchShows(variant);
    if (shows.length) break;
  }
  shows.sort((a, b) => searchScore(query, b.name) - searchScore(query, a.name));
  if (!shows.length) return send(chatId, "Ничего не нашёл. Попробуй английское название.", mainMenu());
  return send(chatId, shows.slice(0, 6).map(s => `<b>${escape(s.name)}</b> ${s.premiered?.slice(0,4) ?? ""}`).join("\n"), {
    inline_keyboard: shows.slice(0, 6).map(s => [{ text: s.name.slice(0, 40), callback_data: `${existing.some(e => e.showId === s.id) ? "status" : "subscribe"}:${s.id}` }]),
  });
}
type Update = { message?: { text?: string; chat?: { id?: number; type?: string } }; callback_query?: { id?: string; data?: string; from?: { id?: number }; message?: { chat?: { id?: number; type?: string } } } };
export async function handleUpdate(update: Update) {
  const callback = update.callback_query;
  const chat = callback?.message?.chat ?? update.message?.chat;
  if (chat?.type !== "private" || !Number.isSafeInteger(chat.id) || chat.id! <= 0) return;
  if (callback && callback.from?.id !== chat.id) return;
  const chatId = String(chat.id);
  if (callback?.id) await telegram("answerCallbackQuery", { callback_query_id: callback.id });
  const rawText = callback?.data ?? update.message?.text;
  if (typeof rawText !== "string") return;
  const text = rawText.trim().slice(0, 4096);
  if (!text) return;
  const [first, ...rest] = text.split(/\s+/);
  const [action, callbackId] = first.replace(/^\//, "").split(":");
  const command = action.split("@")[0].toLowerCase();
  if (command === "start") return send(chatId, "Привет! Я слежу за выходом новых серий.\n\nНапиши название сериала или открой приложение.", mainMenu());
  if (command === "subscriptions" || ["подписки", "мои подписки"].includes(normalizeTitle(text))) return subscriptions(chatId);
  if (command === "check_now" || ["проверить", "проверить серии", "проверить сериалы", "проверить сейчас"].includes(normalizeTitle(text))) return check(chatId);
  if (["subscribe", "unsubscribe", "status", "schedule"].includes(command)) {
    const id = Number(callbackId ?? rest[0]);
    if (!Number.isSafeInteger(id) || id <= 0) return send(chatId, "Нужен ID сериала из поиска", mainMenu());
    if (command === "subscribe") { await getShow(id); await addShow(chatId, id); return send(chatId, "Готово, подписал", mainMenu()); }
    if (command === "unsubscribe") { await removeShow(chatId, id); return subscriptions(chatId); }
    return status(chatId, id, command === "schedule");
  }
  if (!callback) return search(chatId, (command === "search" ? rest.join(" ") : text).slice(0, 120));
}
