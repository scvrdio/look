"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";

import { pluralRu } from "@/lib/plural";
import { fetcher } from "@/lib/fetcher";

import { SeriesCard } from "../components/series/SeriesCard";
import { SeriesSheet } from "../components/series/SeriesSheet";
import { Button } from "../components/ui/button";

type SeriesRow = {
  id: string;
  title: string;
  seasonsCount: number;
  episodesCount: number;
  progress: {
    percent: number;
    last: { season: number; episode: number } | null;
  };
};

type SeasonRow = {
  id: string;
  number: number;
  episodesCount: number;
};

type EpisodeRow = {
  id: string;
  number: number;
  watched: boolean;
};

type BootstrapResponse = {
  series: SeriesRow[];
  seasonsBySeries: Record<string, SeasonRow[]>;
  episodesBySeason: Record<string, EpisodeRow[]>;
};

async function fetchBootstrap(): Promise<BootstrapResponse> {
  const tg = (window as any)?.Telegram?.WebApp;
  const initData: string | undefined = tg?.initData;

  const res = await fetch("/api/bootstrap", {
    method: initData ? "POST" : "GET",
    headers: initData ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: initData ? JSON.stringify({ initData }) : undefined,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Bootstrap failed: ${res.status} ${t}`);
  }

  return (await res.json()) as BootstrapResponse;
}

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");

  const { mutate: mutateGlobal, cache } = useSWRConfig();

  const didBootstrapRef = useRef(false);

  const { data: items, mutate: mutateSeries } = useSWR<SeriesRow[]>(
    "/api/series",
    fetcher
  );

  // --- prefetch helpers ------------------------------------------------------

  function pickPreferredSeasonId(seriesId: string, seasons: SeasonRow[] | undefined) {
    if (!seasons || seasons.length === 0) return null;

    const row = (items ?? []).find((x) => x.id === seriesId);
    const preferredSeasonNumber = row?.progress?.last?.season ?? null;

    if (preferredSeasonNumber != null) {
      const match = seasons.find((s) => s.number === preferredSeasonNumber);
      if (match) return match.id;
    }

    return seasons[0].id;
  }

  async function prefetchSheetData(seriesId: string) {
    const seasonsKey = `/api/series/${seriesId}/seasons`;

    let seasons = cache.get(seasonsKey) as SeasonRow[] | undefined;
    if (!seasons) {
      seasons = await mutateGlobal(seasonsKey, fetcher<SeasonRow[]>(seasonsKey), {
        populateCache: true,
        revalidate: false,
      });
    }

    const preferredSeasonId = pickPreferredSeasonId(seriesId, seasons);
    if (!preferredSeasonId) return;

    const episodesKey = `/api/seasons/${preferredSeasonId}/episodes`;
    if (!cache.get(episodesKey)) {
      await mutateGlobal(episodesKey, fetcher<EpisodeRow[]>(episodesKey), {
        populateCache: true,
        revalidate: false,
      });
    }
  }

  async function warmTopSeries(seriesIds: string[], topN: number) {
    const top = seriesIds.slice(0, topN);

    // топ-5 — быстрее, но без блокировки UI (await внутри effect — ок, он не блокирует рендер)
    await Promise.allSettled(top.map((id) => prefetchSheetData(id)));

    // остальные — фоном с ограничением параллелизма
    void warmRestSeries(seriesIds.slice(topN));
  }

  async function warmRestSeries(rest: string[]) {
    const CONCURRENCY = 2;
    let i = 0;

    async function worker() {
      while (i < rest.length) {
        const id = rest[i++];
        try {
          await prefetchSheetData(id);
        } catch {}
      }
    }

    await Promise.allSettled(Array.from({ length: CONCURRENCY }, worker));
  }

  // --- bootstrap -------------------------------------------------------------

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    (async () => {
      try {
        const boot = await fetchBootstrap();

        // 1) series list
        await mutateGlobal("/api/series", boot.series, { revalidate: false });

        // 2) seasons
        for (const [seriesId, seasons] of Object.entries(boot.seasonsBySeries)) {
          await mutateGlobal(`/api/series/${seriesId}/seasons`, seasons, {
            revalidate: false,
          });
        }

        // 3) episodes (как отдал bootstrap)
        for (const [seasonId, episodes] of Object.entries(boot.episodesBySeason)) {
          await mutateGlobal(`/api/seasons/${seasonId}/episodes`, episodes, {
            revalidate: false,
          });
        }

        // 4) прогрев топ-5 сериалов (сезоны + эпизоды нужного сезона)
        const ids = boot.series.map((x) => x.id);
        void warmTopSeries(ids, 5);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [mutateGlobal]);

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+56px)] pb-28">
        <h1 className="text-[32px] ty-h1">Коллекция</h1>

        <div className="mt-6 space-y-2">
          {(items ?? []).map((s) => {
            const rightTop = s.progress?.last
              ? `S${s.progress.last.season} E${s.progress.last.episode}`
              : "";
            const rightBottom = `${s.progress?.percent ?? 0}%`;

            return (
              <SeriesCard
                key={s.id}
                title={s.title}
                subtitle={`${s.seasonsCount} ${pluralRu(
                  s.seasonsCount,
                  "сезон",
                  "сезона",
                  "сезонов"
                )}, ${s.episodesCount} ${pluralRu(
                  s.episodesCount,
                  "серия",
                  "серии",
                  "серий"
                )}`}
                rightTop={rightTop}
                rightBottom={rightBottom}
                onClick={() => {
                  setActiveSeriesId(s.id);
                  setActiveTitle(s.title);

                  // открываем сразу
                  setSheetOpen(true);

                  // прогреваем в фоне (если вдруг кликнул не из топ-5 или не успели прогреть)
                  prefetchSheetData(s.id).catch(console.error);
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0">
        <div className="mx-auto max-w-[420px] px-5 pt-3 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)]">
          <Link href="/add" className="block">
            <Button>Добавить сериал</Button>
          </Link>
        </div>
      </div>

      <SeriesSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        seriesId={activeSeriesId}
        title={activeTitle}
        onChanged={() => void mutateSeries()}
      />
    </main>
  );
}
