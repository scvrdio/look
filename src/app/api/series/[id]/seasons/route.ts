import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server_auth/getCurrentUser";
import { prisma } from "@/lib/db";
import { excludeTrailingOneEpisodeSeason } from "@/lib/seasonRules";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const user = await getCurrentUser();
  
    const { id: seriesId } = await params;
  
    const body = await req.json().catch(() => ({}));
    const episodesCount = Number(body?.episodesCount);
  
    if (!Number.isInteger(episodesCount) || episodesCount < 1 || episodesCount > 500) {
      return NextResponse.json(
        { error: "episodesCount must be an integer between 1 and 500" },
        { status: 400 }
      );
    }
  
    // сериал должен существовать
    const seriesExists = await prisma.series.findFirst({
      where: {
        id: seriesId,
        links: {
          some: { userId: user.id },
        },
      },
      select: { id: true },
    });
  
    if (!seriesExists) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
  
    // следующий номер сезона
    const last = await prisma.season.findFirst({
      where: { seriesId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
  
    const nextNumber = (last?.number ?? 0) + 1;
  
    const season = await prisma.$transaction(async (tx) => {
      const createdSeason = await tx.season.create({
        data: {
          seriesId,
          number: nextNumber,
          episodesCount,
        },
      });
  
      const existing = await tx.episode.count({
        where: { seasonId: createdSeason.id },
      });
      
      if (existing === 0) {
        await tx.episode.createMany({
          data: Array.from({ length: episodesCount }, (_, i) => ({
            seasonId: createdSeason.id,
            number: i + 1,
          })),
        });
      }
      return createdSeason;
    });
  
    return NextResponse.json(season, { status: 201 });
  }
  

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const user = await getCurrentUser();
    const { id: seriesId } = await params;

    const allowed = await prisma.series.findFirst({
      where: {
        id: seriesId,
        links: {
          some: { userId: user.id },
        },
      },
      select: { id: true },
    });
    if (!allowed) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
  
    const seasons = await prisma.season.findMany({
      where: { seriesId, number: { gte: 1 } },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        episodesCount: true,
      },
    });

    const effectiveSeasons = excludeTrailingOneEpisodeSeason(seasons);

    if (effectiveSeasons.length === 0) {
      return NextResponse.json([]);
    }

    const watchedRows = await prisma.userEpisode.findMany({
      where: {
        userId: user.id,
        episode: {
          season: {
            seriesId,
          },
        },
      },
      select: {
        episode: {
          select: {
            seasonId: true,
          },
        },
      },
    });

    const watchedBySeason = new Map<string, number>();
    for (const row of watchedRows) {
      const sid = row.episode.seasonId;
      watchedBySeason.set(sid, (watchedBySeason.get(sid) ?? 0) + 1);
    }

    return NextResponse.json(
      effectiveSeasons.map((s) => {
        const watchedEpisodes = watchedBySeason.get(s.id) ?? 0;
        return {
          ...s,
          completed: s.episodesCount > 0 && watchedEpisodes >= s.episodesCount,
        };
      })
    );
  }
