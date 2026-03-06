-- 1) Add non-null external id for content identity
ALTER TABLE "Series" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- Normalize source and externalId for existing rows
UPDATE "Series"
SET "source" = 'manual'
WHERE "source" IS NULL;

UPDATE "Series"
SET "externalId" = CASE
  WHEN "source" = 'poiskkino' AND "sourceId" IS NOT NULL THEN "sourceId"::text
  WHEN "sourceId" IS NOT NULL THEN "sourceId"::text
  ELSE 'id:' || "id"
END
WHERE "externalId" IS NULL OR "externalId" = '';

ALTER TABLE "Series" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "Series" ALTER COLUMN "source" SET DEFAULT 'manual';
ALTER TABLE "Series" ALTER COLUMN "externalId" SET NOT NULL;

-- 2) Remove duplicates by (source, externalId) before unique index
WITH ranked AS (
  SELECT
    id,
    "source",
    "externalId",
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "source", "externalId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY "source", "externalId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS keep_id
  FROM "Series"
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
removed_old_links AS (
  DELETE FROM "UserSeries" us
  USING dups d
  WHERE us."seriesId" = d.dup_id
  RETURNING 1
)
DELETE FROM "Series" s
USING dups d
WHERE s.id = d.dup_id;

-- 3) Replace old unique/index strategy
DROP INDEX IF EXISTS "Series_userId_source_sourceId_key";
DROP INDEX IF EXISTS "Series_source_sourceId_key";
DROP INDEX IF EXISTS "Series_userId_title_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "Series_source_externalId_key" ON "Series"("source", "externalId");
CREATE INDEX IF NOT EXISTS "Series_title_idx" ON "Series"("title");
CREATE INDEX IF NOT EXISTS "Series_source_sourceId_idx" ON "Series"("source", "sourceId");

-- 4) Remove legacy ownership from content entity
ALTER TABLE "Series" DROP CONSTRAINT IF EXISTS "Series_userId_fkey";
ALTER TABLE "Series" DROP COLUMN IF EXISTS "userId";

-- 5) Remove legacy global watched flag
ALTER TABLE "Episode" DROP COLUMN IF EXISTS "watched";

-- 6) Ensure supporting indexes for user-state tables
CREATE INDEX IF NOT EXISTS "UserSeries_userId_idx" ON "UserSeries"("userId");
CREATE INDEX IF NOT EXISTS "UserEpisode_userId_idx" ON "UserEpisode"("userId");
