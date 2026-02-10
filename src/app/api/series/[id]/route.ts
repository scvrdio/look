import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await getCurrentUser();

  const { id } = await context.params;

  const series = await prisma.series.findUnique({
    where: { id },
  });

  if (!series) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(series);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await context.params; // <-- ВАЖНО

  await prisma.$transaction(async (tx) => {
    const seasons = await tx.season.findMany({
      where: { seriesId: id },
      select: { id: true },
    });
    const seasonIds = seasons.map((s) => s.id);

    if (seasonIds.length) {
      await tx.episode.deleteMany({ where: { seasonId: { in: seasonIds } } });
      await tx.season.deleteMany({ where: { id: { in: seasonIds } } });
    }

    await tx.series.delete({ where: { id } }); // <-- теперь не undefined
  });

  return NextResponse.json({ ok: true });
}
