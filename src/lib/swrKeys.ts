// src/lib/swrKeys.ts
export const swrKeys = {
    seriesList: () => "/api/series",
    seasonsBySeries: (seriesId: string) => `/api/series/${seriesId}/seasons`,
    episodesBySeason: (seasonId: string) => `/api/seasons/${seasonId}/episodes`,
    // если у тебя эндпоинты другие — поменяй только тут
  };
  