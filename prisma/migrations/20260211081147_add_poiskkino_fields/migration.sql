/*
  Warnings:

  - A unique constraint covering the columns `[userId,source,sourceId]` on the table `Series` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "kind" TEXT,
ADD COLUMN     "posterUrl" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceId" INTEGER,
ADD COLUMN     "year" INTEGER;

-- CreateIndex
CREATE INDEX "Series_userId_title_idx" ON "Series"("userId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "Series_userId_source_sourceId_key" ON "Series"("userId", "source", "sourceId");
