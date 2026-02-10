import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function GET() {
  const user = await getCurrentUser();

  const series = await prisma.series.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      seasons: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          episodes: {
            orderBy: { number: "asc" },
            select: { number: true, watched: true },
          },
        },
      },
    },
  });

  const result = series.map((s) => {
    let total = 0;
    let watched = 0;

    let lastSeason = 0;
    let lastEpisode = 0;

    for (const season of s.seasons) {
      for (const ep of season.episodes) {
        total += 1;
        if (ep.watched) {
          watched += 1;
          if (
            season.number > lastSeason ||
            (season.number === lastSeason && ep.number > lastEpisode)
          ) {
            lastSeason = season.number;
            lastEpisode = ep.number;
          }
        }
      }
    }

    const percent = total === 0 ? 0 : Math.round((watched / total) * 100);

    return {
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      seasonsCount: s.seasons.length,
      episodesCount: total, // ← добавь это
      progress: {
        percent,
        last:
          total === 0
            ? null
            : { season: lastSeason || 1, episode: lastEpisode || 1 },
        watchedEpisodes: watched,
        totalEpisodes: total,
      },
    };
  });

  return NextResponse.json(result);
}

type CreateSeriesBody = {
  title?: unknown;
  seasons?: unknown;
};

export async function POST(req: Request) {
  const user = await getCurrentUser();

  let body: CreateSeriesBody;
  try {
    body = (await req.json()) as CreateSeriesBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const title = String(body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (!Array.isArray(body.seasons) || body.seasons.length === 0) {
    return NextResponse.json({ error: "seasons are required" }, { status: 400 });
  }

  // normalize + validate
  const seasons = body.seasons
    .map((s: any) => ({
      number: Number(s?.number),
      episodesCount: Number(s?.episodesCount),
    }))
    .sort((a, b) => a.number - b.number);

  for (const s of seasons) {
    if (!Number.isInteger(s.number) || s.number <= 0) {
      return NextResponse.json({ error: "invalid season number" }, { status: 400 });
    }
    if (!Number.isInteger(s.episodesCount) || s.episodesCount <= 0) {
      return NextResponse.json(
        { error: "invalid episodesCount" },
        { status: 400 }
      );
    }
    if (s.episodesCount > 200) {
      return NextResponse.json(
        { error: "episodesCount is too large" },
        { status: 400 }
      );
    }
  }

  // prevent duplicates
  for (let i = 1; i < seasons.length; i++) {
    if (seasons[i].number === seasons[i - 1].number) {
      return NextResponse.json(
        { error: "duplicate season number" },
        { status: 400 }
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const series = await tx.series.create({
      data: { title, userId: user.id },
      select: { id: true, title: true, createdAt: true },
    });

    for (const s of seasons) {
      const season = await tx.season.create({
        data: {
          seriesId: series.id,
          number: s.number,
          episodesCount: s.episodesCount,
        },
        select: { id: true, number: true },
      });

      await tx.episode.createMany({
        data: Array.from({ length: s.episodesCount }, (_, i) => ({
          seasonId: season.id,
          number: i + 1,
          watched: false,
        })),
      });
    }

    return series;
  });

  return NextResponse.json(created, { status: 201 });
}
