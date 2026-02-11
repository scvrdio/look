import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) return NextResponse.json({ items: [] });

  // ILIKE для Postgres (работает в Prisma через mode: "insensitive")
  const items = await prisma.series.findMany({
    where: {
      userId: user.id,
      title: { contains: q, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      year: true,
      posterUrl: true,
      kind: true,
      source: true,
      sourceId: true,
      seasons: { select: { id: true } },
      // episodesCount у тебя считается в другом GET, тут делаем быстро:
      _count: { select: { seasons: true } },
    },
  });

  return NextResponse.json({
    items: items.map((s) => ({
      id: s.id,
      title: s.title,
      year: s.year ?? null,
      posterUrl: s.posterUrl ?? null,
      kind: s.kind ?? "series",
      source: s.source ?? null,
      sourceId: s.sourceId ?? null,
      seasonsCount: s._count.seasons,
    })),
  });
}
