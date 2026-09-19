import { NextResponse } from "next/server";
import { getCurrentChatId } from "@/server_auth/getCurrentChatId";
import { bootstrap, catalogSearch, catalogShow, episodeKey } from "@/lib/look-catalog";
import { addShow, libraryState, removeShow, setPaused, setWatched, listMovies, saveMovie, updateMovie } from "@/lib/look-store";
import { demoMovies, getMovie } from "@/lib/movie-catalog";
import { isDemoMode } from "@/lib/subscriptions";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function handle(request: Request, context: Context) {
  const chatId = await getCurrentChatId();
  if (!chatId) return json({ error: "Unauthorized" }, 401);
  const { path } = await context.params;
  const route = path.join("/");
  const method = request.method;
  const url = new URL(request.url);
  try {
    if (method === "GET" && route === "me") return json({ id: chatId, telegramId: chatId });
    if (method === "GET" && route === "catalog/search") {
      const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.trunc(requestedLimit))) : 20;
      return json(await catalogSearch((url.searchParams.get("query") ?? "").slice(0,120), url.searchParams.get("includeMovies") !== "0", limit));
    }
    if (method === "POST" && route === "movies/import") {
      const body = await request.json();
      if (!Number.isSafeInteger(body.id) || body.id <= 0) return json({ error: "Invalid movie" }, 400);
      const movie = (isDemoMode() && demoMovies.find(m => m.id === body.id)) || await getMovie(body.id);
      await saveMovie(chatId, movie);
      return json({ series: { id: `movie:${movie.id}` } }, 201);
    }
    if (method === "POST" && route === "series/import/tvmaze") {
      const body = await request.json();
      if (!Number.isSafeInteger(body.id) || body.id <= 0) return json({ error: "Invalid show" },400);
      await catalogShow(body.id);
      await addShow(chatId, body.id);
      return json({ series: { id: String(body.id) } },201);
    }
    if (method === "GET" && ["bootstrap", "preload", "series", "series/search", "series/in-progress-count"].includes(route)) {
      const data = await bootstrap(chatId);
      if (route === "series") return json(data.series);
      if (route === "series/in-progress-count") return json({ inProgressCount: data.series.filter(s => s.progress.percent > 0 && s.progress.percent < 100 && !s.paused).length });
      if (route === "series/search") return json({ items: data.series.filter(s => s.title.toLowerCase().includes((url.searchParams.get("q") ?? "").toLowerCase())) });
      return json(data);
    }
    if (path[0] === "series" && /^movie:[1-9]\d*$/.test(path[1] ?? "")) {
      const id = Number(path[1].slice(6));
      const movie = (await listMovies(chatId)).find(m => m.id === id);
      if (!movie) return json({ error: "Not found" }, 404);
      if (method === "DELETE" && path.length === 2) { await updateMovie(chatId, id, "delete"); return json({ ok: true }); }
      if (method === "PATCH" && path.length === 2) {
        const body = await request.json();
        if (typeof body.completed !== "boolean") return json({ error: "Invalid update" }, 400);
        await updateMovie(chatId, id, body.completed);
        return json({ ok: true });
      }
      if (method === "GET" && path[2] === "poster") return json({ posterUrl: movie.posterUrl });
      if (method === "GET" && path[2] === "seasons") return json([]);
      return json({ error: "Not found" }, 404);
    }
    const parts = (path[1] ?? "").split(":").map(Number);
    const showId = parts[0];
    if (!parts.length || parts.some(n => !Number.isSafeInteger(n) || n <= 0)) return json({ error: "Not found" },404);
    const state = await libraryState(chatId);
    if (!state.subscriptions.includes(showId)) return json({ error: "Not found" },404);
    if (method === "DELETE" && path[0] === "series" && path.length === 2) { await removeShow(chatId, showId); return json({ ok: true }); }
    const show = await catalogShow(showId);
    if (method === "PATCH" && path[0] === "episodes" && parts.length === 3) {
      const episode = show.episodes.find(e => e.season === parts[1] && e.number === parts[2]);
      if (!episode) return json({ error: "Not found" },404);
      const body = await request.json();
      if (typeof body.watched !== "boolean") return json({ error: "watched must be boolean" },400);
      await setWatched(chatId, showId, [episodeKey(showId,episode)], body.watched);
      return json({ id: path[1], watched: body.watched });
    }
    if (method === "PATCH" && path[0] === "series") {
      const body = await request.json();
      if (body.completed === true) { await setWatched(chatId,showId,show.episodes.map(e => episodeKey(showId,e)),true); await setPaused(chatId,showId,false); }
      else if (typeof body.paused === "boolean") await setPaused(chatId,showId,body.paused);
      else return json({ error: "Invalid update" },400);
      return json({ ok: true });
    }
    const data = await bootstrap(chatId);
    if (method === "GET" && path[0] === "series" && path[2] === "poster") return json({ posterUrl: show.image?.medium ?? null });
    if (method === "GET" && path[0] === "series" && path[2] === "seasons") return json(data.seasonsBySeries[String(showId)] ?? []);
    if (method === "GET" && path[0] === "seasons" && path[2] === "episodes") return json(data.episodesBySeason[path[1]] ?? []);
    if (method === "GET" && path[0] === "series" && path.length === 2) return json({ ...data.series.find(s => s.id === String(showId)), seasons: data.seasonsBySeries[String(showId)] });
    return json({ error: "Not found" },404);
  } catch (error) {
    console.error("look_api_failed", error instanceof Error ? error.message : "Unknown failure");
    return json({ error: "Не удалось загрузить данные. Попробуй ещё раз." },502);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
