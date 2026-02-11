export type SeriesRow = {
    id: string;
    title: string;
    posterUrl: string | null;
    seasonsCount: number;
    episodesCount: number;
    source: string | null;        // ✅ добавить
    sourceId: number | null; 
    progress: {
      percent: number;
      last: { season: number; episode: number } | null;
    };
  };
  
  export type SeasonRow = { id: string; number: number; episodesCount: number };
  export type EpisodeRow = { id: string; number: number; watched: boolean };
  
  export type BootstrapResponse = {
    series: SeriesRow[];
    seasonsBySeries: Record<string, SeasonRow[]>;
    episodesBySeason: Record<string, EpisodeRow[]>;
  };
  