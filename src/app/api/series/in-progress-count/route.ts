import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser"; // подстрой путь

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Сериал "в прогрессе" = есть хотя бы один эпизод not watched
  // При этом сериал принадлежит юзеру
  const inProgressCount = await prisma.series.count({
    where: {
      userId: user.id,
      seasons: {
        some: {
          episodes: {
            some: { watched: false },
          },
        },
      },
    },
  });

  return NextResponse.json({ inProgressCount });
}
