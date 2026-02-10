import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function getCurrentUser() {
  const uid = (await cookies()).get("uid")?.value;

  if (uid) {
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (user) return user;
  }

  // fallback только для локальной разработки
  if (process.env.NODE_ENV !== "production") {
    const telegramId = BigInt(1);
    return prisma.user.upsert({
      where: { telegramId },
      update: {},
      create: { telegramId },
    });
  }

  throw new Error("Unauthorized");
}
