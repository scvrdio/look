import { prisma } from "@/lib/db";

export async function getCurrentUser() {
  // Пока нет Telegram auth — используем dev-user.
  // В проде лучше включать это через флаг, но для твоего текущего этапа так быстрее.
  const telegramId = BigInt(1);

  const existing = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (existing) return existing;

  // Создаём dev-пользователя автоматически, если база пустая
  const created = await prisma.user.create({
    data: { telegramId },
  });

  return created;
}
