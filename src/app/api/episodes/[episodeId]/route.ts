import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function PATCH(
    _req: Request,
    { params }: { params: Promise<{ episodeId: string }> }
  ) {
    const user = await getCurrentUser();
  
    const { episodeId } = await params;
  
    const episode = await prisma.episode.findFirst({
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
      select: { id: true },
    });
  
    if (!episode) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const existing = await prisma.userEpisode.findUnique({
      where: {
        userId_episodeId: {
          userId: user.id,
          episodeId: episode.id,
        },
      },
      select: { episodeId: true },
    });

    if (existing) {
      await prisma.userEpisode.delete({
        where: {
          userId_episodeId: {
            userId: user.id,
            episodeId: episode.id,
          },
        },
      });
      return NextResponse.json({ id: episode.id, watched: false });
    }

    await prisma.userEpisode.create({
      data: { userId: user.id, episodeId: episode.id },
    });

    return NextResponse.json({ id: episode.id, watched: true });
  }
  
