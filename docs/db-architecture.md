# DB Architecture Invariants

This project enforces a strict split between global content and per-user state.

## Core Model

- `Series`: one global row per content item.
- `UserSeries`: user library membership and non-episodic watched state.
- `Season`, `Episode`: global episode catalog per content item.
- `UserEpisode`: per-user episode watched marks.

## Invariants

1. Content rows are global and not user-owned.
2. User-specific data lives only in `UserSeries` / `UserEpisode`.
3. Content identity is `Series.source + Series.externalId` (unique).
4. No `NULL` identity fields for content uniqueness.
5. Add/import flows are idempotent (`upsert` + conflict-safe links).
6. Data migrations are rerunnable-safe (`IF EXISTS` / conflict handling).
7. Query-path indexes exist for user/content joins.
8. API access checks are relation-based (`Series.links.some({ userId })`).
9. Legacy global progress fields are removed from runtime model.
10. Production rollout must run in order: DB migrate -> app deploy -> smoke test.

## Rollout Checklist

1. `npx prisma migrate deploy`
2. `npx prisma generate`
3. Deploy app commit with matching Prisma client/schema.
4. Smoke test:
   - two users add same item -> one `Series` row, two `UserSeries` rows
   - toggling episode for user A does not change user B progress
5. SQL checks:

```sql
-- no duplicate content identities
SELECT "source", "externalId", COUNT(*) c
FROM "Series"
GROUP BY 1,2
HAVING COUNT(*) > 1;

-- no broken user links
SELECT COUNT(*) AS dangling_user_series
FROM "UserSeries" us
LEFT JOIN "Series" s ON s."id" = us."seriesId"
LEFT JOIN "User" u ON u."id" = us."userId"
WHERE s."id" IS NULL OR u."id" IS NULL;

SELECT COUNT(*) AS dangling_user_episode
FROM "UserEpisode" ue
LEFT JOIN "Episode" e ON e."id" = ue."episodeId"
LEFT JOIN "User" u ON u."id" = ue."userId"
WHERE e."id" IS NULL OR u."id" IS NULL;
```
