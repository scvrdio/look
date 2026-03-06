-- CreateTable
CREATE TABLE "UserSeries" (
    "userId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSeries_pkey" PRIMARY KEY ("userId","seriesId")
);

-- CreateIndex
CREATE INDEX "UserSeries_seriesId_idx" ON "UserSeries"("seriesId");

-- AddForeignKey
ALTER TABLE "UserSeries" ADD CONSTRAINT "UserSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSeries" ADD CONSTRAINT "UserSeries_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing owner-to-series links
INSERT INTO "UserSeries" ("userId", "seriesId")
SELECT "userId", "id"
FROM "Series"
ON CONFLICT ("userId", "seriesId") DO NOTHING;
