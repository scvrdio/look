import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";
import type { BootstrapResponse, SeasonRow, EpisodeRow } from "@/types/bootstrap";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1) серии пользователя
  const series = await prisma.series.findMany({
    where: {
      links: {
        some: { userId: user.id },
      },
    },
    select: {
      id: true,
      title: true,
      kind: true,
      posterUrl: true,
      source: true,
      sourceId: true,
      createdAt: true,
      links: {
        where: { userId: user.id },
        select: { watched: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const seriesIds = series.map((s) => s.id);

  // 2) сезоны всех сериалов одним запросом
  const seasons = await prisma.season.findMany({
    where: { seriesId: { in: seriesIds } },
    select: { id: true, seriesId: true, number: true, episodesCount: true },
    orderBy: [{ seriesId: "asc" }, { number: "asc" }],
  });

  const seasonsBySeries: Record<string, SeasonRow[]> = {};
  for (const s of seasons) {
    (seasonsBySeries[s.seriesId] ||= []).push({
      id: s.id,
      number: s.number,
      episodesCount: s.episodesCount,
    });
  }

  // 3) эпизоды ТОЛЬКО первых сезонов (по одному сезону на сериал)
  const firstSeasonIds = seriesIds
    .map((sid) => seasonsBySeries[sid]?.[0]?.id)
    .filter(Boolean) as string[];

  const episodes = await prisma.episode.findMany({
    where: { seasonId: { in: firstSeasonIds } },
    select: { id: true, seasonId: true, number: true },
    orderBy: [{ seasonId: "asc" }, { number: "asc" }],
  });

  const watchedFirstRows = await prisma.userEpisode.findMany({
    where: {
      userId: user.id,
      episodeId: { in: episodes.map((e) => e.id) },
    },
    select: { episodeId: true },
  });
  const watchedFirstSet = new Set(watchedFirstRows.map((x) => x.episodeId));

  const episodesBySeason: Record<string, EpisodeRow[]> = {};
  for (const e of episodes) {
    (episodesBySeason[e.seasonId] ||= []).push({
      id: e.id,
      number: e.number,
      watched: watchedFirstSet.has(e.id),
    });
  }

  // 4) прогресс по всем эпизодам всех сериалов
  const watchedAllRows = await prisma.userEpisode.findMany({
    where: {
      userId: user.id,
      episode: { season: { seriesId: { in: seriesIds } } },
    },
    select: {
      episode: {
        select: {
          seasonId: true,
          number: true,
          season: { select: { seriesId: true, number: true } },
        },
      },
    },
  });

  const epStats: Record<
    string,
    { total: number; watched: number; last: { season: number; episode: number } | null }
  > = {};
  const watchedBySeasonId = new Map<string, number>();

  for (const row of watchedAllRows) {
    const e = row.episode;
    const sid = e.season.seriesId;
    watchedBySeasonId.set(e.seasonId, (watchedBySeasonId.get(e.seasonId) ?? 0) + 1);
    const st = (epStats[sid] ||= { total: 0, watched: 0, last: null });
    st.watched += 1;
    st.last = { season: e.season.number, episode: e.number };
  }

  for (const seasons of Object.values(seasonsBySeries)) {
    for (const season of seasons) {
      const watchedEpisodes = watchedBySeasonId.get(season.id) ?? 0;
      season.completed = season.episodesCount > 0 && watchedEpisodes >= season.episodesCount;
    }
  }

  const seriesRows: BootstrapResponse["series"] = series.map((s) => {
    const seasonsArr = seasonsBySeries[s.id] ?? [];
    const seasonsCount = seasonsArr.length;
    const episodesCount = seasonsArr.reduce((acc, x) => acc + x.episodesCount, 0);

    const st = epStats[s.id] ?? { total: 0, watched: 0, last: null };
    st.total = episodesCount;
    const movieWatched = s.links[0]?.watched ?? false;
    const percent = episodesCount > 0 ? Math.round((st.watched / st.total) * 100) : (movieWatched ? 100 : 0);
    const paused = episodesCount > 0 ? movieWatched : false;

    return {
        id: s.id,
        title: s.title,
        posterUrl: s.posterUrl ?? null,
        source: s.source ?? null,
        sourceId: (s.sourceId as number | null) ?? null,
        seasonsCount,
        episodesCount,
        progress: { percent, last: st.last },
        paused,
    };
  });

  const payload: BootstrapResponse = {
    series: seriesRows,
    seasonsBySeries,
    episodesBySeason,
  };
  console.log("CURRENT USER ID", user.id);
  return NextResponse.json(payload);
}
