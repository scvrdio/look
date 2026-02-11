import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export const runtime = "nodejs";

const SOURCE = "poiskkino";

type PoiskKinoDetails = {
    id: number;
    name: string;
    year: number | null;
    posterUrl: string | null;
    type: string | null;
    seasonsInfo: Array<{ number: number; episodesCount: number }>;
};

export async function POST(req: Request) {
    try {
        const user = await getCurrentUser();

        const body = await req.json().catch(() => null);
        const externalId = Number(body?.id);
        if (!Number.isFinite(externalId)) {
            return NextResponse.json({ message: "Bad id" }, { status: 400 });
        }

        // 1) дедуп до запросов во внешний API
        const existing = await prisma.series.findFirst({
            where: { userId: user.id, source: SOURCE, sourceId: externalId },
            select: { id: true, title: true, kind: true },
        });
        if (existing) {
            return NextResponse.json({ series: existing, alreadyExists: true });
        }

        // 2) тянем деталку через наш же серверный роут (ключ остаётся на сервере)
        const origin = new URL(req.url).origin;
        const detailRes = await fetch(`${origin}/api/poiskkino/movie/${externalId}`, {
            cache: "no-store",
        });

        if (!detailRes.ok) {
            const err = await detailRes.json().catch(() => null);
            return NextResponse.json(
                { message: "PoiskKino detail failed", status: detailRes.status, err },
                { status: 502 }
            );
        }

        const d = (await detailRes.json()) as PoiskKinoDetails;

        const type = (d.type ?? "").toString();
        const seasonsInfo = Array.isArray(d.seasonsInfo) ? d.seasonsInfo : [];

        const isSeries = type === "tv-series" || seasonsInfo.length > 0;
        const kind = isSeries ? "series" : "movie";

        // 3) создаём series (гонку ловим через unique и fallback-read)
        let series: { id: string; title: string; kind: string | null };
        try {
            series = await prisma.series.create({
                data: {
                    userId: user.id,
                    title: d.name || "Untitled",
                    source: SOURCE,
                    sourceId: externalId,
                    posterUrl: d.posterUrl ?? null,
                    year: d.year ?? null,
                    kind,
                },
                select: { id: true, title: true, kind: true },
            });
        } catch (e) {
            const again = await prisma.series.findFirst({
                where: { userId: user.id, source: SOURCE, sourceId: externalId },
                select: { id: true, title: true, kind: true },
            });
            if (again) return NextResponse.json({ series: again, alreadyExists: true });
            throw e;
        }

        // movie — без сезонов/эпизодов
        if (kind === "movie") {
            return NextResponse.json({ series, alreadyExists: false });
        }

        // 4) сезоны пачкой
        await prisma.season.createMany({
            data: seasonsInfo.map((s) => ({
                seriesId: series.id,
                number: s.number,
                episodesCount: s.episodesCount,
            })),
            skipDuplicates: true,
        });

        // 5) эпизоды пачками (чтобы не N запросов)
        const seasons: Array<{ id: string; episodesCount: number }> = await prisma.season.findMany({
            where: { seriesId: series.id },
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
    } catch (e: any) {
        return NextResponse.json(
            {
                message: "Import failed",
                error: e?.message ?? String(e),
                stack: process.env.NODE_ENV !== "production" ? e?.stack ?? null : null,
            },
            { status: 500 }
        );
    }
}
