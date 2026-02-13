import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server_auth/getCurrentUser";
import { prisma } from "@/lib/db";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    await getCurrentUser();
  
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
    const seriesExists = await prisma.series.findUnique({
      where: { id: seriesId },
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
    await getCurrentUser();
    const { id: seriesId } = await params;
  
    const seasons = await prisma.season.findMany({
      where: { seriesId, number: { gte: 1 } },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        episodesCount: true,
      },
    });
  
    return NextResponse.json(seasons);
  }