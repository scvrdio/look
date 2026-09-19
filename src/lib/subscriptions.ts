export type Subscription = {
  chatId: string;
  showId: number;
  showName: string;
  lastEpisodeId: number | null;
  createdAt: string;
};

export type ShowSummary = {
  id: number;
  name: string;
  premiered: string | null;
  status: string | null;
  url: string | null;
  posterUrl: string | null;
  nextEpisode: { name: string; code: string; airdate: string | null } | null;
};

const TVMAZE_URL = "https://api.tvmaze.com";

const demoSubscriptions: Subscription[] = [
  { chatId: "1", showId: 169, showName: "Black Mirror", lastEpisodeId: null, createdAt: "2026-09-01T10:00:00Z" },
  { chatId: "1", showId: 82, showName: "Game of Thrones", lastEpisodeId: null, createdAt: "2026-08-28T10:00:00Z" },
];

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export function isDemoMode() {
  return process.env.NODE_ENV !== "production" && !getConfig();
}

export async function supabase<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error("Supabase is not configured");

  const authHeaders: Record<string, string> = { apikey: config.key };
  if (config.key.startsWith("eyJ")) {
    authHeaders.Authorization = `Bearer ${config.key}`;
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : []) as T;
}

function toSubscription(row: Record<string, unknown>): Subscription {
  return {
    chatId: String(row.chat_id),
    showId: Number(row.show_id),
    showName: String(row.show_name),
    lastEpisodeId: row.last_episode_id == null ? null : Number(row.last_episode_id),
    createdAt: String(row.created_at),
  };
}

export async function listSubscriptions(chatId: string): Promise<Subscription[]> {
  if (isDemoMode()) return demoSubscriptions.filter((item) => item.chatId === chatId);
  const rows = await supabase<Record<string, unknown>[]>(
    `subscriptions?chat_id=eq.${encodeURIComponent(chatId)}&select=chat_id,show_id,show_name,last_episode_id,created_at&order=created_at.desc`,
  );
  return rows.map(toSubscription);
}

export async function subscribe(chatId: string, show: ShowSummary) {
  if (isDemoMode()) return;
  const episodes = await tvmaze<{ id: number; airdate: string | null }[]>(`/shows/${show.id}/episodes`);
  const today = new Date().toISOString().slice(0, 10);
  const aired = episodes.filter((episode) => episode.airdate && episode.airdate <= today);
  const lastEpisode = aired.at(-1)?.id ?? null;

  await supabase("subscriptions?on_conflict=chat_id,show_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([{
      chat_id: chatId,
      show_id: show.id,
      show_name: show.name,
      last_episode_id: lastEpisode,
    }]),
  });
}

export async function unsubscribe(chatId: string, showId: number) {
  if (isDemoMode()) return;
  await supabase(`subscriptions?chat_id=eq.${encodeURIComponent(chatId)}&show_id=eq.${showId}`, {
    method: "DELETE",
  });
}

async function tvmaze<T>(path: string): Promise<T> {
  const response = await fetch(`${TVMAZE_URL}${path}`, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`TVmaze request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function toShowSummary(show: Record<string, unknown>): ShowSummary {
  const image = show.image as Record<string, unknown> | null;
  const embedded = show._embedded as Record<string, unknown> | undefined;
  const next = embedded?.nextepisode as Record<string, unknown> | undefined;
  const season = typeof next?.season === "number" ? String(next.season).padStart(2, "0") : null;
  const episode = typeof next?.number === "number" ? String(next.number).padStart(2, "0") : null;

  return {
    id: Number(show.id),
    name: String(show.name),
    premiered: typeof show.premiered === "string" ? show.premiered : null,
    status: typeof show.status === "string" ? show.status : null,
    url: typeof show.url === "string" ? show.url : null,
    posterUrl: typeof image?.medium === "string" ? image.medium : null,
    nextEpisode: next ? {
      name: typeof next.name === "string" ? next.name : "Новая серия",
      code: season && episode ? `S${season}E${episode}` : "Скоро",
      airdate: typeof next.airdate === "string" ? next.airdate : null,
    } : null,
  };
}

export async function searchShows(query: string): Promise<ShowSummary[]> {
  const rows = await tvmaze<{ show: Record<string, unknown> }[]>(`/search/shows?q=${encodeURIComponent(query)}`);
  return rows.slice(0, 12).map((row) => toShowSummary(row.show));
}

export async function getShow(showId: number): Promise<ShowSummary> {
  const show = await tvmaze<Record<string, unknown>>(`/shows/${showId}?embed=nextepisode`);
  return toShowSummary(show);
}

export async function listSubscriptionShows(chatId: string) {
  const subscriptions = await listSubscriptions(chatId);
  const shows = await Promise.all(subscriptions.map((subscription) => getShow(subscription.showId)));
  return shows.map((show, index) => ({ ...show, subscribedAt: subscriptions[index].createdAt }));
}
