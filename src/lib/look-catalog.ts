import { isDemoMode } from "./subscriptions";
import type { BootstrapResponse, SeriesRow } from "@/types/bootstrap";
import { libraryState, listMovies } from "./look-store";
import { demoMovies, searchMovies } from "./movie-catalog";

export type CatalogEpisode = { id: number; season: number; number: number | null; name: string; airdate: string | null };
export type CatalogShow = { id: number; name: string; premiered: string | null; image: { medium: string } | null; genres: string[]; episodes: CatalogEpisode[] };
const fixtures: CatalogShow[] = [
  { id: 169, name: "Black Mirror", premiered: "2011-12-04", image: null, genres: ["Drama"], episodes: [
    { id: 1, season: 1, number: 1, name: "The National Anthem", airdate: "2011-12-04" },
    { id: 2, season: 1, number: 2, name: "Fifteen Million Merits", airdate: "2011-12-11" },
    { id: 3, season: 1, number: 3, name: "The Entire History of You", airdate: "2011-12-18" },
    { id: 4, season: 2, number: 1, name: "Be Right Back", airdate: "2013-02-11" },
    { id: 5, season: 2, number: 2, name: "White Bear", airdate: "2013-02-18" },
  ] },
  { id: 82, name: "Game of Thrones", premiered: "2011-04-17", image: null, genres: ["Fantasy"], episodes: [
    { id: 6, season: 1, number: 1, name: "Winter Is Coming", airdate: "2011-04-17" },
    { id: 7, season: 1, number: 2, name: "The Kingsroad", airdate: "2011-04-24" },
  ] },
];

async function catalog<T>(endpoint: string): Promise<T> {
  const response = await fetch(`https://api.tvmaze.com${endpoint}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Catalog unavailable (${response.status})`);
  return response.json();
}

export async function catalogShow(id: number): Promise<CatalogShow> {
  const demo = isDemoMode() && fixtures.find(s => s.id === id);
  if (demo) return demo;
  const [show, episodes] = await Promise.all([catalog<Omit<CatalogShow, "episodes">>(`/shows/${id}`), catalog<CatalogEpisode[]>(`/shows/${id}/episodes`)]);
  return { ...show, episodes: episodes.filter(e => e.number !== null && e.season > 0) };
}

export async function catalogSearch(query: string, includeMovies = true, limit = 20) {
  query = query.trim();
  if (!query) return { items: [] };
  const moviesTask = !includeMovies ? Promise.resolve({ movies: [], warning: undefined }) :
    (isDemoMode() ? Promise.resolve(demoMovies.filter(m => m.name.toLowerCase().includes(query.toLowerCase()))) : searchMovies(query))
      .then(movies => ({ movies, warning: undefined as string | undefined }))
      .catch(() => ({ movies: [], warning: "Фильмы сейчас не загрузились. Попробуй поискать ещё раз." }));
  let seriesWarning: string | undefined;
  const shows = isDemoMode() ? fixtures.filter(s => s.name.toLowerCase().includes(query.toLowerCase())) :
    (await catalog<{ show: CatalogShow }[]>(`/search/shows?q=${encodeURIComponent(query)}`).catch(() => {
      seriesWarning = "Сериалы сейчас не загрузились. Попробуй поискать ещё раз.";
      return [];
    })).map(r => r.show);
  const items = await Promise.all(shows.slice(0, 20).map(async s => {
    // Search summaries don't include episodes. Fetch the cached episode list,
    // excluding specials, without failing the entire search if one list is unavailable.
    const episodes = isDemoMode() ? s.episodes : await catalog<CatalogEpisode[]>(`/shows/${s.id}/episodes`).catch(() => null);
    const regular = episodes?.filter(e => e.number !== null && e.season > 0);
    return {
      id: s.id, name: s.name,
      year: s.premiered ? Number(s.premiered.slice(0,4)) : null,
      posterUrl: s.image?.medium ?? null, type: "tv-series",
      seasonsCount: regular ? new Set(regular.map(e => e.season)).size : null,
      episodesCount: regular?.length ?? null,
    };
  }));
  const { movies, warning } = await moviesTask;
  // Negative search IDs reserve a separate namespace for PoiskKino films;
  // stored movie IDs stay positive and never enter TVmaze subscriptions.
  const movieItems = movies.map(m => ({ ...m, id: -m.id, type: "movie", seasonsCount: null, episodesCount: null }));
  // Interleave provider rankings so a full TV result page cannot hide every film.
  const combined = [] as Array<(typeof items)[number] | (typeof movieItems)[number]>;
  for (let i = 0; i < Math.max(items.length, movieItems.length); i++) {
    if (items[i]) combined.push(items[i]);
    if (movieItems[i]) combined.push(movieItems[i]);
  }
  const normalized = query.toLocaleLowerCase();
  combined.sort((a, b) => Number(b.name.toLocaleLowerCase() === normalized) - Number(a.name.toLocaleLowerCase() === normalized));
  return { items: combined.slice(0, limit), warning: [seriesWarning, warning].filter(Boolean).join(" ") || undefined };
}

export const episodeKey = (show: number, episode: CatalogEpisode) => `${show}:${episode.season}:${episode.number}`;

export async function bootstrap(chatId: string): Promise<BootstrapResponse> {
  const [state, movies] = await Promise.all([libraryState(chatId), listMovies(chatId)]);
  const shows = await Promise.all(state.subscriptions.map(catalogShow));
  const watched = new Set(state.watched);
  const result: BootstrapResponse = { series: [], seasonsBySeries: {}, episodesBySeason: {} };
  for (const show of shows) {
    const id = String(show.id);
    const numbers = [...new Set(show.episodes.map(e => e.season))].sort((a,b) => a-b);
    const marked = show.episodes.filter(e => watched.has(episodeKey(show.id,e)));
    const last = marked.at(-1);
    const row: SeriesRow = {
      id, title: show.name, posterUrl: show.image?.medium ?? null, source: "tvmaze", sourceId: show.id, kind: "tv-series",
      year: show.premiered ? Number(show.premiered.slice(0, 4)) : null,
      seasonsCount: numbers.length, episodesCount: show.episodes.length, paused: state.paused.includes(show.id),
      progress: { percent: show.episodes.length ? Math.round(marked.length / show.episodes.length * 100) : 0, last: last ? { season: last.season, episode: last.number! } : null },
    };
    result.series.push(row);
    result.seasonsBySeries[id] = numbers.map(number => {
      const seasonId = `${id}:${number}`;
      const episodes = show.episodes.filter(e => e.season === number);
      result.episodesBySeason[seasonId] = episodes.map(e => ({ id: episodeKey(show.id,e), number: e.number!, watched: watched.has(episodeKey(show.id,e)) }));
      return { id: seasonId, number, episodesCount: episodes.length, completed: episodes.length > 0 && episodes.every(e => watched.has(episodeKey(show.id,e))) };
    });
  }
  for (const movie of movies) {
    const id = `movie:${movie.id}`;
    result.series.push({ id, title: movie.name, year: movie.year, posterUrl: movie.posterUrl, kind: "movie", source: "poiskkino", sourceId: -movie.id,
      seasonsCount: 0, episodesCount: 0, paused: false, progress: { percent: movie.watched ? 100 : 0, last: null } });
    result.seasonsBySeries[id] = [];
  }
  return result;
}
