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

    const docs = data?.docs ?? [];
    const items = Array.isArray(docs)
        ? docs.map((m: any) => {
            if (!m || typeof m !== "object") {
                return null;
            }

            const seasonsInfo = Array.isArray(m.seasonsInfo) ? m.seasonsInfo : [];

            const validSeasons = seasonsInfo.filter(
                (s: any) => Number.isInteger(s?.number) && s.number >= 1
            );

            const seasonsCount = validSeasons.length;

            const episodesCount = validSeasons.reduce(
                (acc: number, s: any) =>
                    acc + (Number.isInteger(s?.episodesCount) ? s.episodesCount : 0),
                0
            );

            return {
                id: m.id,
                name: m.name ?? m.alternativeName ?? "",
                year: m.year ?? null,
                posterUrl: m.poster?.url ?? null,
                type: m.type ?? null,
                seasonsCount: seasonsCount || null,
                episodesCount: episodesCount || null,
            };
        }).filter(Boolean)
        : [];


    return NextResponse.json({
        items,
        page: data?.page ?? Number(page),
        limit: data?.limit ?? Number(limit),
        pages: data?.pages ?? null,
        total: data?.total ?? null,
    });
}
