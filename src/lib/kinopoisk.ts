export type KinopoiskLink = { url: string; exact: boolean };

export function kinopoiskPage(id: number, kind: "movie" | "series"): KinopoiskLink {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid Kinopoisk ID");
  return { url: `https://www.kinopoisk.ru/${kind === "movie" ? "film" : "series"}/${id}/`, exact: true };
}

export function kinopoiskSearch(title: string): KinopoiskLink {
  return { url: `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(title)}`, exact: false };
}

type Candidate = { id: number; type?: string; isSeries?: boolean; externalId?: { imdb?: string | null } };

export function matchingKinopoiskSeries(docs: Candidate[], imdb: string): number | null {
  const matches = docs.filter(doc => doc.externalId?.imdb === imdb &&
    (doc.isSeries === true || ["tv-series", "animated-series", "tv-show"].includes(doc.type ?? "")) &&
    Number.isSafeInteger(doc.id) && doc.id > 0);
  const ids = [...new Set(matches.map(doc => doc.id))];
  return ids.length === 1 ? ids[0] : null;
}
