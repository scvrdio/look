import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ seasonId: string }> }
) {
  await getCurrentUser();

  const { seasonId } = await params;

  const episodes = await prisma.episode.findMany({
    where: { seasonId },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      watched: true,
    },
  });

  return NextResponse.json(episodes);
}
