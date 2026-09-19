import { isDemoMode } from "./subscriptions";
import type { BootstrapResponse, SeriesRow } from "@/types/bootstrap";
import { libraryState } from "./look-store";

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

export async function catalogSearch(query: string) {
  const shows = isDemoMode() ? fixtures.filter(s => s.name.toLowerCase().includes(query.toLowerCase())) :
    (await catalog<{ show: CatalogShow }[]>(`/search/shows?q=${encodeURIComponent(query)}`)).map(r => r.show);
  return { items: shows.map(s => ({ id: s.id, name: s.name, year: s.premiered ? Number(s.premiered.slice(0,4)) : null, posterUrl: s.image?.medium ?? null, type: "tv-series", genres: s.genres })) };
}

export const episodeKey = (show: number, episode: CatalogEpisode) => `${show}:${episode.season}:${episode.number}`;

export async function bootstrap(chatId: string): Promise<BootstrapResponse> {
  const state = await libraryState(chatId);
  const shows = await Promise.all(state.subscriptions.map(catalogShow));
  const watched = new Set(state.watched);
  const result: BootstrapResponse = { series: [], seasonsBySeries: {}, episodesBySeason: {} };
  for (const show of shows) {
    const id = String(show.id);
    const numbers = [...new Set(show.episodes.map(e => e.season))].sort((a,b) => a-b);
    const marked = show.episodes.filter(e => watched.has(episodeKey(show.id,e)));
    const last = marked.at(-1);
    const row: SeriesRow = {
      id, title: show.name, posterUrl: show.image?.medium ?? null, source: "tvmaze", sourceId: show.id,
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
  return result;
}
