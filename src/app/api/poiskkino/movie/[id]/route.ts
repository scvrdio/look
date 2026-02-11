import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE = process.env.POISKKINO_BASE_URL ?? "https://api.poiskkino.dev";
const KEY = process.env.POISKKINO_API_KEY;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!KEY) return NextResponse.json({ message: "POISKKINO_API_KEY missing" }, { status: 500 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) return NextResponse.json({ message: "Bad id" }, { status: 400 });

  const res = await fetch(`${BASE}/v1.4/movie/${id}`, {
    headers: { "X-API-KEY": KEY },
    next: { revalidate: 3600 },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ message: "PoiskKino error", status: res.status, data }, { status: 502 });
  }

  return NextResponse.json({
    id: data?.id,
    name: data?.name ?? data?.alternativeName ?? "",
    year: data?.year ?? null,
    posterUrl: data?.poster?.url ?? null,
    type: data?.type ?? null,
    seasonsInfo: Array.isArray(data?.seasonsInfo) ? data.seasonsInfo : [],
  });
}
