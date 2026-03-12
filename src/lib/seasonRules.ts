type SeasonLike = {
  number: number;
  episodesCount: number;
};

// Ignore a synthetic "next season" placeholder if it is the last season
// and contains exactly one episode.
export function excludeTrailingOneEpisodeSeason<T extends SeasonLike>(seasons: T[]): T[] {
  if (seasons.length <= 1) return [...seasons].sort((a, b) => a.number - b.number);

  const ordered = [...seasons].sort((a, b) => a.number - b.number);
  const last = ordered[ordered.length - 1];
  if (last.episodesCount !== 1) return ordered;

  return ordered.slice(0, -1);
}

