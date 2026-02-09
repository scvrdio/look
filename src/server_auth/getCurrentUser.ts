import { prisma } from "@/lib/db";

export async function getCurrentUser() {
  const user = await prisma.user.findUnique({ where: { telegramId: 1 } });
  if (!user) throw new Error("Dev user (telegramId=1) not found");
  return user;
}
