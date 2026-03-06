import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export const runtime = "nodejs";

const SOURCE = "poiskkino";
const BASE = process.env.POISKKINO_BASE_URL ?? "https://api.poiskkino.dev";
const KEY = process.env.POISKKINO_API_KEY;
const SERIES_TYPES = new Set(["tv-series", "anime", "animated-series", "tv-show"]);

type PoiskKinoDetails = {
  id: number;
  name: string;
  year: number | null;
  posterUrl: string | null;
  type: string | null;
  seasonsInfo: Array<{ number: number; episodesCount: number }>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | null {
  if (error instanceof Error && typeof error.stack === "string") {
    return error.stack;
  }
  return null;
}

function isSeriesType(type: string | null | undefined) {
  if (!type) return false;
  return SERIES_TYPES.has(type);
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();

    const body = await req.json().catch(() => null);
    const externalId = Number(body?.id);
    if (!Number.isFinite(externalId)) {
      return NextResponse.json({ message: "Bad id" }, { status: 400 });
    }

    // 1) дедуп до запросов во внешний API
    const existing = await prisma.series.findUnique({
      where: {
        source_externalId: {
          source: SOURCE,
          externalId: String(externalId),
        },
      },
      select: { id: true, title: true, kind: true },
    });
    if (existing) {
      await prisma.userSeries.upsert({
        where: {
          userId_seriesId: { userId: user.id, seriesId: existing.id },
        },
        create: { userId: user.id, seriesId: existing.id },
        update: {},
      });
      return NextResponse.json({ series: existing, alreadyExists: true });
    }

    // 2) тянем деталку напрямую из poiskkino (без внутреннего fetch на свой API)
    if (!KEY) {
      return NextResponse.json({ message: "POISKKINO_API_KEY missing" }, { status: 500 });
    }

    const movieRes = await fetch(`${BASE}/v1.4/movie/${externalId}`, {
      headers: { "X-API-KEY": KEY },
    });
    const movieData = await movieRes.json().catch(() => null);

    if (!movieRes.ok) {
      return NextResponse.json(
        { message: "PoiskKino movie failed", status: movieRes.status, data: movieData },
        { status: 502 }
      );
    }

    const type = (movieData?.type ?? null) as string | null;

    // seasonsInfo собираем ТОЛЬКО из /season (там теперь реальные данные)
    let seasonsInfo: Array<{ number: number; episodesCount: number }> = [];

    if (isSeriesType(type)) {
      const seasonRes = await fetch(`${BASE}/v1.4/season?movieId=${externalId}`, {
        headers: { "X-API-KEY": KEY },
      });
      const seasonData = await seasonRes.json().catch(() => null);

      if (!seasonRes.ok) {
        // сериал без сезонов нам не нужен — не создаём пустую запись
        return NextResponse.json(
          { message: "PoiskKino seasons failed", status: seasonRes.status, data: seasonData },
          { status: 502 }
        );
      }

      const docs = Array.isArray(seasonData?.docs) ? seasonData.docs : [];

      // нормализуем: выкидываем season=0, дедуп по number, берём max episodesCount
      const map = new Map<number, { number: number; episodesCount: number }>();

      for (const s of docs) {
        const num = Number(s?.number);
        if (!Number.isInteger(num) || num < 1) continue; // IMPORTANT: никаких 0 сезонов

        const epsCount = Array.isArray(s?.episodes) ? s.episodes.length : 0;

        const prev = map.get(num);
        if (!prev || epsCount > prev.episodesCount) {
          map.set(num, { number: num, episodesCount: epsCount });
        }
      }

      seasonsInfo = Array.from(map.values()).sort((a, b) => a.number - b.number);

      // если это сериал, но сезонов нет — не импортируем
      if (seasonsInfo.length === 0) {
        return NextResponse.json(
          { message: "Каталог не отдал сезоны для этого сериала. Попробуйте позже." },
          { status: 502 }
        );
      }
    }

    const d: PoiskKinoDetails = {
      id: Number(movieData?.id ?? externalId),
      name: String(movieData?.name ?? movieData?.alternativeName ?? "").trim(),
      year: typeof movieData?.year === "number" ? movieData.year : null,
      posterUrl: movieData?.poster?.url ?? null,
      type,
      seasonsInfo,
    };

    const isSeries = isSeriesType(d.type) || d.seasonsInfo.length > 0;
    const kind = isSeries ? "series" : (d.type ?? "movie");

    // 3) создаём series (гонку ловим через unique и fallback-read)
    const series: { id: string; title: string; kind: string | null } = await prisma.series.upsert({
      where: {
        source_externalId: {
          source: SOURCE,
          externalId: String(externalId),
        },
      },
      update: {
        title: d.name || "Untitled",
        posterUrl: d.posterUrl ?? null,
        year: d.year ?? null,
        kind,
        sourceId: externalId,
      },
      create: {
        title: d.name || "Untitled",
        source: SOURCE,
        externalId: String(externalId),
        sourceId: externalId,
        posterUrl: d.posterUrl ?? null,
        year: d.year ?? null,
        kind,
      },
      select: { id: true, title: true, kind: true },
    });
    await prisma.userSeries.upsert({
      where: {
        userId_seriesId: { userId: user.id, seriesId: series.id },
      },
      create: { userId: user.id, seriesId: series.id },
      update: {},
    });

    // movie — без сезонов/эпизодов
    if (!isSeries) {
      return NextResponse.json({ series, alreadyExists: false });
    }

    // 4) сезоны пачкой (уже чистые, без 0 сезона)
    await prisma.season.createMany({
      data: d.seasonsInfo.map((s) => ({
        seriesId: series.id,
        number: s.number,
        episodesCount: s.episodesCount,
      })),
      skipDuplicates: true,
    });

    // 5) эпизоды пачками
    const seasons = await prisma.season.findMany({
      where: { seriesId: series.id, number: { gte: 1 } }, // safety
      select: { id: true, episodesCount: true },
    });

    const episodesData: Array<{ seasonId: string; number: number }> = seasons.flatMap((s) => {
      const n = Math.max(0, s.episodesCount);
      return Array.from({ length: n }, (_, i) => ({
        seasonId: s.id,
        number: i + 1,
      }));
    });

    const CHUNK = 2000;
    for (let i = 0; i < episodesData.length; i += CHUNK) {
      await prisma.episode.createMany({
        data: episodesData.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ series, alreadyExists: false });
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    if (message === "Unauthorized") {
      return NextResponse.json(
        { message: "Unauthorized. Reopen the mini app to refresh session." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        message: "Import failed",
        error: message,
        stack: process.env.NODE_ENV !== "production" ? getErrorStack(e) : null,
      },
      { status: 500 }
    );
  }
}
