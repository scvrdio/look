import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE = process.env.POISKKINO_BASE_URL ?? "https://api.poiskkino.dev";
const KEY = process.env.POISKKINO_API_KEY;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!KEY) return NextResponse.json({ message: "POISKKINO_API_KEY missing" }, { status: 500 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ message: "Bad id" }, { status: 400 });

  const movieRes = await fetch(`${BASE}/v1.4/movie/${id}`, {
    headers: { "X-API-KEY": KEY },
  });

  const movieData = await movieRes.json().catch(() => null);
  if (!movieRes.ok) {
    return NextResponse.json(
      { message: "PoiskKino error", status: movieRes.status, data: movieData },
      { status: 502 }
    );
  }

  const type: string | null = movieData?.type ?? null;

  let seasonsInfo: Array<{ number: number; episodesCount: number }> = [];

  if (type === "tv-series") {
    const seasonRes = await fetch(`${BASE}/v1.4/season?movieId=${id}`, {
      headers: { "X-API-KEY": KEY },
    });

    const seasonData = await seasonRes.json().catch(() => null);

    if (seasonRes.ok) {
      const docs = Array.isArray(seasonData?.docs) ? seasonData.docs : [];

      const mapped: Array<{ number: number; episodesCount: number }> = docs
        .filter((s: any) => Number.isInteger(s?.number) && s.number >= 1)
        .map((s: any) => ({
          number: Number(s.number),
          episodesCount: Array.isArray(s?.episodes) ? s.episodes.length : 0,
        }));

      seasonsInfo = mapped.sort((a, b) => a.number - b.number);
    }
  }

  return NextResponse.json({
    id: movieData?.id,
    name: movieData?.name ?? movieData?.alternativeName ?? "",
    year: movieData?.year ?? null,
    posterUrl: movieData?.poster?.url ?? null,
    type,
    seasonsInfo,
  });
}
