import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser"; // подстрой путь

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // если у тебя в User нет имени — верни null и возьмём из Telegram позже
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, telegramId: true }, // сюда добавишь name, если есть
  });

  return NextResponse.json({
    name: null,
    telegramId: dbUser?.telegramId?.toString() ?? null,
  });
}
