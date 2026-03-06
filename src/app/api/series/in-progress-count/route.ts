import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser"; // подстрой путь

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Сериал "в прогрессе" = есть хотя бы один эпизод not watched
  // При этом сериал принадлежит юзеру
  const linked = await prisma.userSeries.findMany({
    where: { userId: user.id },
    select: {
      seriesId: true,
      watched: true,
      series: {
        select: {
          seasons: {
            select: { episodesCount: true },
          },
        },
      },
    },
  });

  const seriesIds = linked.map((x) => x.seriesId);
  const watchedRows = await prisma.userEpisode.findMany({
    where: {
      userId: user.id,
      episode: {
        season: {
          seriesId: { in: seriesIds },
        },
      },
    },
    select: {
      episode: {
        select: { season: { select: { seriesId: true } } },
      },
    },
  });

  const watchedBySeries = new Map<string, number>();
  for (const row of watchedRows) {
    const sid = row.episode.season.seriesId;
    watchedBySeries.set(sid, (watchedBySeries.get(sid) ?? 0) + 1);
  }

  const inProgressCount = linked.reduce((acc, link) => {
    const total = link.series.seasons.reduce((sum, s) => sum + s.episodesCount, 0);
    const watched = watchedBySeries.get(link.seriesId) ?? 0;
    if (total === 0) {
      return acc + (link.watched ? 0 : 1);
    }
    return acc + (watched < total ? 1 : 0);
  }, 0);
  return NextResponse.json({ inProgressCount });
}
