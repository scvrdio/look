import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server_auth/getCurrentUser";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await getCurrentUser();

  const { id } = await context.params;

  const series = await prisma.series.findUnique({
    where: { id },
  });

  if (!series) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(series);
}
