import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function GET() {

  const user = await getCurrentUser();

  const series = await prisma.series.findMany({
    where: {
      links: {
        some: { userId: user.id },
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      kind: true,
      createdAt: true,
      source: true,
      sourceId: true,
      posterUrl: true,
      links: {
        where: { userId: user.id },
        select: { watched: true },
        take: 1,
      },
      seasons: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          episodesCount: true,
        },
      },
    },
  });

  const seasonIds = series.flatMap((s) => s.seasons.map((x) => x.id));

  const watchedRows = await prisma.userEpisode.findMany({
    where: {
      userId: user.id,
      episode: {
        seasonId: { in: seasonIds },
      },
    },
    select: {
      episode: {
        select: {
          seasonId: true,
          number: true,
          season: {
            select: {
              seriesId: true,
              number: true,
            },
          },
        },
      },
    },
  });

  const watchedCountMap = new Map<string, number>();
  const lastMap = new Map<string, { season: number; episode: number }>();

  for (const row of watchedRows) {
    const ep = row.episode;
    watchedCountMap.set(ep.seasonId, (watchedCountMap.get(ep.seasonId) ?? 0) + 1);

    const prev = lastMap.get(ep.season.seriesId);
    if (
      !prev ||
      ep.season.number > prev.season ||
      (ep.season.number === prev.season && ep.number > prev.episode)
    ) {
      lastMap.set(ep.season.seriesId, {
        season: ep.season.number,
        episode: ep.number,
      });
    }
  }

  const result = series.map((s) => {
    let total = 0;
    let watched = 0;

    for (const season of s.seasons) {
      total += season.episodesCount;
      const watchedInSeason = watchedCountMap.get(season.id) ?? 0;
      watched += watchedInSeason;
    }

    const personalMovieWatched = s.links[0]?.watched ?? false;
    const percent = total === 0 ? (personalMovieWatched ? 100 : 0) : Math.round((watched / total) * 100);
    const last = total === 0 ? null : (lastMap.get(s.id) ?? null);

    return {
      id: s.id,
      title: s.title,
      kind: s.kind,
      createdAt: s.createdAt,
      source: s.source,
      sourceId: s.sourceId,
      posterUrl: s.posterUrl,
      seasonsCount: s.seasons.length,
      episodesCount: total,
      progress: {
        percent,
        last,
        watchedEpisodes: watched,
        totalEpisodes: total,
      },
      paused: total > 0 ? (s.links[0]?.watched ?? false) : false,
    };

  });

  return NextResponse.json(result);
}

type CreateSeriesBody = {
  title?: unknown;
  seasons?: unknown;
};

type CreateSeasonInput = {
  number?: unknown;
  episodesCount?: unknown;
};

function normalizeManualExternalId(title: string) {
  const normalized = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return `title:${normalized || "untitled"}`;
}

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
  const seasons = (body.seasons as CreateSeasonInput[])
    .map((s) => ({
      number: Number(s.number),
      episodesCount: Number(s.episodesCount),
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

  const manualExternalId = normalizeManualExternalId(title);

  const created = await prisma.$transaction(async (tx) => {
    const series = await tx.series.upsert({
      where: {
        source_externalId: {
          source: "manual",
          externalId: manualExternalId,
        },
      },
      update: {
        title,
        kind: "series",
      },
      create: {
        title,
        kind: "series",
        source: "manual",
        externalId: manualExternalId,
      },
      select: { id: true, title: true, createdAt: true },
    });
    await tx.userSeries.upsert({
      where: {
        userId_seriesId: { userId: user.id, seriesId: series.id },
      },
      create: { userId: user.id, seriesId: series.id },
      update: {},
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
        })),
      });
    }

    return series;
  });

  return NextResponse.json(created, { status: 201 });
}
