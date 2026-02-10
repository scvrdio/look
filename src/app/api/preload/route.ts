// src/app/api/preload/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser"; // подстрой путь

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(10, Number(url.searchParams.get("limit") ?? "3")));

  const t0 = Date.now();

  // 1) series top-N
  const series = await prisma.series.findMany({
    where: { userId: user.id },
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const seriesIds = series.map((s) => s.id);

  // 2) seasons for these series
  const seasons = await prisma.season.findMany({
    where: { seriesId: { in: seriesIds } },
    select: { id: true, seriesId: true, number: true, episodesCount: true },
    orderBy: [{ seriesId: "asc" }, { number: "asc" }],
  });

  const seasonIds = seasons.map((s) => s.id);

  // 3) episodes for all these seasons
  const episodes = await prisma.episode.findMany({
    where: { seasonId: { in: seasonIds } },
    select: { id: true, seasonId: true, number: true, watched: true },
    orderBy: [{ seasonId: "asc" }, { number: "asc" }],
  });

  // 4) собрать структуру как SWR keys ждут
  const seasonsBySeries: Record<string, any[]> = {};
  for (const s of seasons) (seasonsBySeries[s.seriesId] ||= []).push({ id: s.id, number: s.number, episodesCount: s.episodesCount });

  const episodesBySeason: Record<string, any[]> = {};
  for (const e of episodes) (episodesBySeason[e.seasonId] ||= []).push({ id: e.id, number: e.number, watched: e.watched });

  const ms = Date.now() - t0;

  const res = NextResponse.json({ series, seasonsBySeries, episodesBySeason });
  res.headers.set("Server-Timing", `app;dur=${ms}`);
  return res;
}
