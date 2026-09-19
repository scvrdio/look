import { kinopoiskPage, kinopoiskSearch, matchingKinopoiskSeries, type KinopoiskLink } from "./kinopoisk";

export async function resolveSeriesKinopoisk(show: { name: string; externals?: { imdb?: string | null } }): Promise<KinopoiskLink> {
  const fallback = kinopoiskSearch(show.name);
  const imdb = show.externals?.imdb;
  const key = process.env.POISKKINO_API_KEY;
  if (!key || !imdb || !/^tt\d+$/.test(imdb)) return fallback;
  try {
    const params = new URLSearchParams({ "externalId.imdb": imdb, limit: "10", page: "1" });
    const response = await fetch(`${process.env.POISKKINO_BASE_URL ?? "https://api.poiskkino.dev"}/v1.4/movie?${params}`, {
      headers: { "X-API-KEY": key }, next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const id = matchingKinopoiskSeries(Array.isArray(data.docs) ? data.docs : [], imdb);
    return id ? kinopoiskPage(id, "series") : fallback;
  } catch { return fallback; }
}
