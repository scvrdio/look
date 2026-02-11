import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";
import type { BootstrapResponse, SeasonRow, EpisodeRow } from "@/types/bootstrap";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1) серии пользователя
  const series = await prisma.series.findMany({
    where: { userId: user.id },
    select: { id: true, title: true, posterUrl: true, source: true, sourceId: true, createdAt: true },
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

  // 4) прогресс по всем эпизодам всех сериалов
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
      st.last = { season: e.season.number, episode: e.number };
    }
  }

  const seriesRows: BootstrapResponse["series"] = series.map((s) => {
    const seasonsArr = seasonsBySeries[s.id] ?? [];
    const seasonsCount = seasonsArr.length;
    const episodesCount = seasonsArr.reduce((acc, x) => acc + x.episodesCount, 0);

    const st = epStats[s.id] ?? { total: 0, watched: 0, last: null };
    const percent = st.total > 0 ? Math.round((st.watched / st.total) * 100) : 0;

    return {
        id: s.id,
        title: s.title,
        posterUrl: s.posterUrl ?? null,
        source: s.source ?? null,
        sourceId: (s.sourceId as number | null) ?? null,
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
  console.log("CURRENT USER ID", user.id);
  return NextResponse.json(payload);
}
