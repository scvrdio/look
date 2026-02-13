import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BASE = process.env.POISKKINO_BASE_URL ?? "https://api.poiskkino.dev";
const KEY = process.env.POISKKINO_API_KEY;

type UpstreamDoc = {
  id: number;
  name?: string | null;
  alternativeName?: string | null;
  year?: number | null;
  type?: string | null; // "movie" | "tv-series" | ...
  poster?: { url?: string | null } | null;
  seasonsInfo?: Array<{ number?: number; episodesCount?: number }> | null;
};

type Item = {
  id: number;
  name: string;
  year: number | null;
  posterUrl: string | null;
  type: string | null;
  seasonsCount: number | null;
  episodesCount: number | null;
};

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normKeepSpaces(s: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"“”'’]/g, "")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normNoSpaces(s: string) {
  return normKeepSpaces(s).replace(/[\s-]+/g, "");
}

function scoreName(q1: string, q2: string, name: string) {
  const n1 = normKeepSpaces(name);
  const n2 = normNoSpaces(name);

  if (!n1) return 99;

  if (n1 === q1 || n2 === q2) return 0;
  if (n1.startsWith(q1) || n2.startsWith(q2)) return 1;
  if (n1.includes(q1) || n2.includes(q2)) return 2;

  const tokens = q1.split(" ").filter(Boolean);
  if (tokens.length >= 2 && tokens.every((t) => n1.includes(t))) return 3;

  return 9;
}

function buildItem(m: UpstreamDoc): Item | null {
  if (!m || typeof m !== "object") return null;
  if (typeof m.id !== "number") return null;

  const seasonsInfo = Array.isArray(m.seasonsInfo) ? m.seasonsInfo : [];
  const validSeasons = seasonsInfo.filter(
    (s) => Number.isInteger(s?.number) && (s.number as number) >= 1
  );

  const seasonsCount = validSeasons.length;
  const episodesCount = validSeasons.reduce((acc, s) => {
    const n = s?.episodesCount;
    return acc + (Number.isInteger(n) && (n as number) > 0 ? (n as number) : 0);
  }, 0);

  return {
    id: m.id,
    name: String(m.name ?? m.alternativeName ?? "").trim(),
    year: typeof m.year === "number" ? m.year : null,
    posterUrl: m.poster?.url ?? null,
    type: typeof m.type === "string" ? m.type : null,
    seasonsCount: seasonsCount > 0 ? seasonsCount : null,
    episodesCount: episodesCount > 0 ? episodesCount : null,
  };
}

export async function GET(req: Request) {
  if (!KEY) {
    return NextResponse.json({ message: "POISKKINO_API_KEY missing" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);

  const query = (searchParams.get("query") ?? "").trim();
  const page = clamp(toInt(searchParams.get("page"), 1), 1, 50);
  const limit = clamp(toInt(searchParams.get("limit"), 20), 1, 50);

  // фильмы пока скрываем; в будущем включишь параметром includeMovies=1
  const includeMovies = searchParams.get("includeMovies") === "1";

  if (query.length < 2) {
    return NextResponse.json({ items: [], page, limit, pages: null, total: null });
  }

  const upstream = new URL(`${BASE}/v1.4/movie/search`);
  upstream.searchParams.set("query", query);
  upstream.searchParams.set("page", String(page));
  upstream.searchParams.set("limit", String(limit));

  const res = await fetch(upstream.toString(), {
    headers: { "X-API-KEY": KEY },
    next: { revalidate: 0 },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const status = res.status;
    const code = data?.code ?? null;

    const message =
      status === 429
        ? "Лимит запросов к каталогу исчерпан. Попробуйте позже или добавьте вручную."
        : "Ошибка каталога";

    return NextResponse.json({ message, status, code, data }, { status });
  }

  const docs: UpstreamDoc[] = Array.isArray(data?.docs) ? data.docs : [];

  const itemsAll: Item[] = docs.map(buildItem).filter((x): x is Item => Boolean(x && x.name));

  const itemsFiltered = includeMovies
    ? itemsAll
    : itemsAll.filter((it) => it.type !== "movie"); // скрываем фильмы сейчас

  const q1 = normKeepSpaces(query);
  const q2 = normNoSpaces(query);

  const ranked = itemsFiltered
    .map((it) => ({
      it,
      s: scoreName(q1, q2, it.name),
      y: typeof it.year === "number" ? it.year : -1,
      l: it.name.length,
    }))
    .sort((a, b) => {
      if (a.s !== b.s) return a.s - b.s; // релевантность
      if (a.y !== b.y) return b.y - a.y; // новее выше
      return a.l - b.l; // короче выше
    })
    .map((x) => x.it)
    .slice(0, limit);

  return NextResponse.json({
    items: ranked,
    page: typeof data?.page === "number" ? data.page : page,
    limit,
    pages: typeof data?.pages === "number" ? data.pages : null,
    total: typeof data?.total === "number" ? data.total : null,
  });
}
