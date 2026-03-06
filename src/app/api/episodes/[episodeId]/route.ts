import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function PATCH(
    _req: Request,
    { params }: { params: Promise<{ episodeId: string }> }
  ) {
    const user = await getCurrentUser();
  
    const { episodeId } = await params;
  
    const current = await prisma.episode.findFirst({
      where: {
        id: episodeId,
        season: {
          series: {
            links: {
              some: { userId: user.id },
            },
          },
        },
      },
      select: { id: true, watched: true },
    });
  
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  
    const episode = await prisma.episode.update({
      where: { id: current.id },
      data: {
        watched: !current.watched,
      },
      select: {
        id: true,
        watched: true,
      },
    });
  
    return NextResponse.json(episode);
  }
  
