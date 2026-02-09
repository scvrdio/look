import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST() {
  // dev user
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(1) },
    update: {},
    create: { telegramId: BigInt(1) },
  });

  // привязать все серии без userId
  const updated = await prisma.series.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  });

  return NextResponse.json({ userId: user.id, updated: updated.count });
}
