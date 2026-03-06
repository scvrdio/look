import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ seasonId: string }> }
) {
  const user = await getCurrentUser();

  const { seasonId } = await params;

  const allowed = await prisma.season.findFirst({
    where: {
      id: seasonId,
      series: {
        links: {
          some: { userId: user.id },
        },
      },
    },
    select: { id: true },
  });
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const episodes = await prisma.episode.findMany({
    where: { seasonId },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
    },
  });

  const watchedRows = await prisma.userEpisode.findMany({
    where: {
      userId: user.id,
      episodeId: { in: episodes.map((e) => e.id) },
    },
    select: { episodeId: true },
  });
  const watchedSet = new Set(watchedRows.map((x) => x.episodeId));

  return NextResponse.json(
    episodes.map((e) => ({
      ...e,
      watched: watchedSet.has(e.id),
    }))
  );
}
