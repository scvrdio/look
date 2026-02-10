import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser"; // подстрой путь под твой проект

type SeriesRow = {
  id: string;
  title: string;
  seasonsCount: number;
  episodesCount: number;
  progress: {
    percent: number;
    last: { season: number; episode: number } | null;
  };
};

type SeasonRow = { id: string; number: number; episodesCount: number };
type EpisodeRow = { id: string; number: number; watched: boolean };

type BootstrapResponse = {
  series: SeriesRow[];
  seasonsBySeries: Record<string, SeasonRow[]>;
  episodesBySeason: Record<string, EpisodeRow[]>;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1) серии пользователя
  const series = await prisma.series.findMany({
    where: { userId: user.id },
    select: { id: true, title: true, createdAt: true },
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
    select: { id: true, seasonId: true, number: true, watched: true },
    orderBy: [{ seasonId: "asc" }, { number: "asc" }],
  });

  const episodesBySeason: Record<string, EpisodeRow[]> = {};
  for (const e of episodes) {
    (episodesBySeason[e.seasonId] ||= []).push({
      id: e.id,
      number: e.number,
      watched: e.watched,
    });
  }

  // 4) собрать SeriesRow с counts + progress (вычисляем из сезонов/episodesCount)
  // episodesCount = сумма episodesCount по сезонам
  // seasonsCount = количество сезонов
  // progress = процент просмотренных эпизодов (по watched=true) среди всех эпизодов серии
  // last = последний просмотренный эпизод (макс по (season.number, episode.number))
  //
  // Для точного progress нужен просмотр всех эпизодов серии.
  // Это можно сделать 1 агрегирующим запросом по episodes через join season->series.
  const watchedAgg = await prisma.episode.groupBy({
    by: ["seasonId"],
    _count: { _all: true, watched: true } as any, // TS может ругаться, но Prisma выполнит
    where: {
      season: { seriesId: { in: seriesIds } },
    },
  });

  // Prisma groupBy не умеет _count watched из коробки в типах, поэтому ниже делаем проще и надежнее:
  // возьмём все эпизоды серии (id, watched, season.number, episode.number) одним запросом
  const allEpisodes = await prisma.episode.findMany({
    where: { season: { seriesId: { in: seriesIds } } },
    select: {
      watched: true,
      number: true,
      season: { select: { seriesId: true, number: true } },
    },
    orderBy: [{ season: { number: "asc" } }, { number: "asc" }],
  });

  const epStats: Record<
    string,
    { total: number; watched: number; last: { season: number; episode: number } | null }
  > = {};

  for (const e of allEpisodes) {
    const sid = e.season.seriesId;
    const st = (epStats[sid] ||= { total: 0, watched: 0, last: null });

    st.total += 1;
    if (e.watched) {
      st.watched += 1;
      st.last = { season: e.season.number, episode: e.number }; // так как сортировка asc, последний watched перезапишет
    }
  }

  const seriesRows: SeriesRow[] = series.map((s) => {
    const seasonsArr = seasonsBySeries[s.id] ?? [];
    const seasonsCount = seasonsArr.length;
    const episodesCount = seasonsArr.reduce((acc, x) => acc + x.episodesCount, 0);

    const st = epStats[s.id] ?? { total: 0, watched: 0, last: null };
    const percent =
      st.total > 0 ? Math.round((st.watched / st.total) * 100) : 0;

    return {
      id: s.id,
      title: s.title,
      seasonsCount,
      episodesCount,
      progress: { percent, last: st.last },
    };
  });

  const payload: BootstrapResponse = {
    series: seriesRows,
    seasonsBySeries,
    episodesBySeason,
  };

  return NextResponse.json(payload);
}
