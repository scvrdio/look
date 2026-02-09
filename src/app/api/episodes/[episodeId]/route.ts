import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function PATCH(
    _req: Request,
    { params }: { params: Promise<{ episodeId: string }> }
  ) {
    await getCurrentUser();
  
    const { episodeId } = await params;
  
    const current = await prisma.episode.findUnique({
      where: { id: episodeId },
      select: { watched: true },
    });
  
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  
    const episode = await prisma.episode.update({
      where: { id: episodeId },
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
  