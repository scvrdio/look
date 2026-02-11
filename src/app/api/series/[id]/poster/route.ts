import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params; // ✅ ВАЖНО

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await prisma.series.findFirst({
    where: {
      id,
      userId: user.id,
    },
    select: {
      posterUrl: true,
    },
  });

  return NextResponse.json({
    posterUrl: row?.posterUrl ?? null,
  });
}
