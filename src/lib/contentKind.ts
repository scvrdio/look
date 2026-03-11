const SERIES_LIKE_TYPES = new Set([
  "series",
  "tv-series",
  "anime",
  "animated-series",
  "tv-show",
]);

export type ContentKind = "series" | "movie";

export function isSeriesContentKind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return SERIES_LIKE_TYPES.has(kind);
}

export function normalizeContentKind(kind: string | null | undefined): ContentKind {
  return isSeriesContentKind(kind) ? "series" : "movie";
}

export function contentTypeLabelRu(kind: string | null | undefined): "Сериал" | "Фильм" {
  return normalizeContentKind(kind) === "series" ? "Сериал" : "Фильм";
}
