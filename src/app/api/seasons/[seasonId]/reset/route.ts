import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ seasonId: string }> }
) {
  await getCurrentUser();
  const { seasonId } = await params;

  console.log("RESET seasonId =", seasonId);

  // удаляем все эпизоды сезона
  await prisma.episode.deleteMany({ where: { seasonId } });

  // берём сколько эпизодов должно быть
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { episodesCount: true },
  });

  if (!season) {
    return NextResponse.json({ error: "Season not found" }, { status: 404 });
  }

  // создаём заново ровно N эпизодов
  await prisma.episode.createMany({
    data: Array.from({ length: season.episodesCount }, (_, i) => ({
      seasonId,
      number: i + 1,
    })),
  });

  return NextResponse.json({ ok: true });
}
