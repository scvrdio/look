import { prisma } from "../src/lib/db";

async function main() {
  await prisma.user.upsert({
    where: { telegramId: 1n },
    update: {},
    create: { telegramId: 1n },
  });

  console.log("Dev user created (telegramId=1)");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });