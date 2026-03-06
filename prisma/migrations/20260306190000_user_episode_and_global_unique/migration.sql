-- Add per-user watched state for non-episodic content
ALTER TABLE "UserSeries"
ADD COLUMN "watched" BOOLEAN NOT NULL DEFAULT false;

-- Create per-user watched episodes table
CREATE TABLE "UserEpisode" (
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEpisode_pkey" PRIMARY KEY ("userId","episodeId")
);

CREATE INDEX "UserEpisode_episodeId_idx" ON "UserEpisode"("episodeId");

ALTER TABLE "UserEpisode"
ADD CONSTRAINT "UserEpisode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserEpisode"
ADD CONSTRAINT "UserEpisode_episodeId_fkey"
FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deduplicate globally by source+sourceId before creating unique index.
-- Keep the oldest row per (source, sourceId), move all user links to it, then delete duplicates.
WITH ranked AS (
  SELECT
    id,
    "source",
    "sourceId",
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "source", "sourceId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY "source", "sourceId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS keep_id
  FROM "Series"
  WHERE "source" IS NOT NULL AND "sourceId" IS NOT NULL
),
dups AS (
  SELECT id AS dup_id, keep_id
  FROM ranked
  WHERE rn > 1
),
moved_links AS (
  INSERT INTO "UserSeries" ("userId", "seriesId", "watched", "createdAt")
  SELECT us."userId", d.keep_id, us."watched", us."createdAt"
  FROM "UserSeries" us
  JOIN dups d ON d.dup_id = us."seriesId"
  ON CONFLICT ("userId", "seriesId")
  DO UPDATE SET "watched" = "UserSeries"."watched" OR EXCLUDED."watched"
  RETURNING 1
),
deleted_old_links AS (
  DELETE FROM "UserSeries" us
  USING dups d
  WHERE us."seriesId" = d.dup_id
  RETURNING 1
)
DELETE FROM "Series" s
USING dups d
WHERE s.id = d.dup_id;

-- Migrate legacy global episode flags into per-user watched episodes
INSERT INTO "UserEpisode" ("userId", "episodeId")
SELECT DISTINCT us."userId", e."id"
FROM "Episode" e
JOIN "Season" se ON se."id" = e."seasonId"
JOIN "UserSeries" us ON us."seriesId" = se."seriesId"
WHERE e."watched" = true
ON CONFLICT ("userId", "episodeId") DO NOTHING;

-- Replace per-user unique source constraint with global one
DROP INDEX IF EXISTS "Series_userId_source_sourceId_key";
CREATE UNIQUE INDEX "Series_source_sourceId_key" ON "Series"("source", "sourceId");
