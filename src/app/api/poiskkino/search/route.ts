import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE = process.env.POISKKINO_BASE_URL ?? "https://api.poiskkino.dev";
const KEY = process.env.POISKKINO_API_KEY;

export async function GET(req: Request) {
  if (!KEY) return NextResponse.json({ message: "POISKKINO_API_KEY missing" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim();
  const page = searchParams.get("page") ?? "1";
  const limit = searchParams.get("limit") ?? "20";

  if (query.length < 2) {
    return NextResponse.json({ items: [], page: Number(page), limit: Number(limit) });
  }

  const upstream = new URL(`${BASE}/v1.4/movie/search`);
  upstream.searchParams.set("query", query);
  upstream.searchParams.set("page", page);
  upstream.searchParams.set("limit", limit);

  const res = await fetch(upstream.toString(), {
    headers: { "X-API-KEY": KEY },
    next: { revalidate: 30 },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ message: "PoiskKino error", status: res.status, data }, { status: 502 });
  }

  const docs = data?.docs ?? [];
  const items = docs.map((m: any) => ({
    id: m.id,
    name: m.name ?? m.alternativeName ?? "",
    year: m.year ?? null,
    posterUrl: m.poster?.url ?? null,
    type: m.type ?? null,
  }));

  return NextResponse.json({
    items,
    page: data?.page ?? Number(page),
    limit: data?.limit ?? Number(limit),
    pages: data?.pages ?? null,
    total: data?.total ?? null,
  });
}
