import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDemoMode, listSubscriptions, subscribe, unsubscribe, supabase, getShow } from "./subscriptions";
import type { Movie } from "./movie-catalog";

export type SavedMovie = Movie & { watched: boolean };
type State = { subscriptions: number[]; watched: string[]; paused: number[]; movies?: SavedMovie[] };
const queues = new Map<string, Promise<unknown>>();
const defaults = (): State => ({ subscriptions: [169, 82], watched: [], paused: [] });

async function local(chatId: string, change?: (state: State) => void): Promise<State> {
  if (!/^\d+$/.test(chatId)) throw new Error("Invalid account");
  const previous = queues.get(chatId) ?? Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    const directory = path.join(process.cwd(), ".local-data");
    const file = path.join(directory, `${chatId}.json`);
    let state: State;
    try { state = JSON.parse(await readFile(file, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = defaults();
    }
    if (change) {
      change(state);
      await mkdir(directory, { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
      await rename(temporary, file);
    }
    return state;
  });
  queues.set(chatId, job);
  try { return await job; }
  finally { if (queues.get(chatId) === job) queues.delete(chatId); }
}

export async function libraryState(chatId: string): Promise<State> {
  if (isDemoMode()) return local(chatId);
  const account = encodeURIComponent(chatId);
  const [subscriptions, episodes, series] = await Promise.all([
    listSubscriptions(chatId),
    supabase<{ episode_id: string }[]>(`look_episode_progress?chat_id=eq.${account}&select=episode_id`),
    supabase<{ show_id: number; paused: boolean }[]>(`look_series_state?chat_id=eq.${account}&select=show_id,paused`),
  ]);
  return { subscriptions: subscriptions.map(s => s.showId), watched: episodes.map(e => e.episode_id), paused: series.filter(s => s.paused).map(s => s.show_id) };
}

export async function addShow(chatId: string, showId: number) {
  if (isDemoMode()) return local(chatId, s => { if (!s.subscriptions.includes(showId)) s.subscriptions.unshift(showId); });
  // Never reset the bot's notification cursor when a user adds an existing show.
  if ((await listSubscriptions(chatId)).some(s => s.showId === showId)) return;
  await subscribe(chatId, await getShow(showId));
}

export async function removeShow(chatId: string, showId: number) {
  if (isDemoMode()) return local(chatId, s => {
    s.subscriptions = s.subscriptions.filter(id => id !== showId);
    s.paused = s.paused.filter(id => id !== showId);
    s.watched = s.watched.filter(id => !id.startsWith(`${showId}:`));
  });
  await unsubscribe(chatId, showId);
  const filter = `chat_id=eq.${encodeURIComponent(chatId)}&show_id=eq.${showId}`;
  await Promise.all([
    supabase(`look_episode_progress?${filter}`, { method: "DELETE" }),
    supabase(`look_series_state?${filter}`, { method: "DELETE" }),
  ]);
}

export async function setWatched(chatId: string, showId: number, ids: string[], watched: boolean) {
  if (isDemoMode()) return local(chatId, s => {
    const values = new Set(s.watched);
    for (const id of ids) { if (watched) values.add(id); else values.delete(id); }
    s.watched = [...values];
  });
  if (!ids.length) return;
  if (watched) {
    await supabase("look_episode_progress?on_conflict=chat_id,episode_id", {
      method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(ids.map(id => ({ chat_id: chatId, show_id: showId, episode_id: id }))),
    });
  } else {
    for (const id of ids) await supabase(`look_episode_progress?chat_id=eq.${encodeURIComponent(chatId)}&episode_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

export async function setPaused(chatId: string, showId: number, paused: boolean) {
  if (isDemoMode()) return local(chatId, s => { s.paused = s.paused.filter(id => id !== showId); if (paused) s.paused.push(showId); });
  await supabase("look_series_state?on_conflict=chat_id,show_id", {
    method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ chat_id: chatId, show_id: showId, paused }),
  });
}

export async function listMovies(chatId: string): Promise<SavedMovie[]> {
  if (isDemoMode()) return (await local(chatId)).movies ?? [];
  const rows = await supabase<{ movie_id: number; title: string; year: number | null; poster_url: string | null; watched: boolean }[]>(`look_movies?chat_id=eq.${encodeURIComponent(chatId)}&select=movie_id,title,year,poster_url,watched&order=created_at.desc`);
  return rows.map(row => ({ id: row.movie_id, name: row.title, year: row.year, posterUrl: row.poster_url, watched: row.watched }));
}

export async function saveMovie(chatId: string, movie: Movie) {
  if (isDemoMode()) return local(chatId, state => {
    state.movies ??= [];
    if (!state.movies.some(m => m.id === movie.id)) state.movies.unshift({ ...movie, watched: false });
  });
  // Re-adding must not reset a previously watched film.
  await supabase("look_movies?on_conflict=chat_id,movie_id", {
    method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ chat_id: chatId, movie_id: movie.id, title: movie.name, year: movie.year, poster_url: movie.posterUrl }),
  });
}

export async function updateMovie(chatId: string, id: number, watched: boolean | "delete") {
  if (isDemoMode()) return local(chatId, state => {
    if (watched === "delete") state.movies = (state.movies ?? []).filter(m => m.id !== id);
    else { const movie = state.movies?.find(m => m.id === id); if (movie) movie.watched = watched; }
  });
  await supabase(`look_movies?chat_id=eq.${encodeURIComponent(chatId)}&movie_id=eq.${id}`, watched === "delete" ? { method: "DELETE" } : {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watched }),
  });
}
