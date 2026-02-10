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

  // Список сериалов теперь приходит из bootstrap и кладется в SWR cache.
  const { data: items, mutate: mutateSeries } = useSWR<SeriesRow[]>(
    "/api/series",
    fetcher
  );

  // 1) Bootstrap один раз: auth + данные + прогрев кеша по ключам SWR
  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    (async () => {
      try {
        const boot = await fetchBootstrap();

        // series
        await mutateGlobal("/api/series", boot.series, { revalidate: false });

        // seasons
        for (const [seriesId, seasons] of Object.entries(boot.seasonsBySeries)) {
          await mutateGlobal(`/api/series/${seriesId}/seasons`, seasons, {
            revalidate: false,
          });
        }

        // episodes (только первые сезоны, как отдаёт bootstrap)
        for (const [seasonId, episodes] of Object.entries(boot.episodesBySeason)) {
          await mutateGlobal(`/api/seasons/${seasonId}/episodes`, episodes, {
            revalidate: false,
          });
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [mutateGlobal]);

  // helper: прогреть сезоны и эпизоды первого сезона (если вдруг не пришли в bootstrap)
  async function prefetchSheetData(seriesId: string) {
    const seasonsKey = `/api/series/${seriesId}/seasons`;

    let seasons = cache.get(seasonsKey) as SeasonRow[] | undefined;
    if (!seasons) {
      seasons = await mutateGlobal(
        seasonsKey,
        fetcher<SeasonRow[]>(seasonsKey),
        { populateCache: true, revalidate: false }
      );
    }

    const firstSeasonId = seasons?.[0]?.id;
    if (firstSeasonId) {
      const episodesKey = `/api/seasons/${firstSeasonId}/episodes`;
      if (!cache.get(episodesKey)) {
        await mutateGlobal(episodesKey, fetcher(episodesKey), {
          populateCache: true,
          revalidate: false,
        });
      }
    }
  }

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

                  // Шторку открываем сразу (без блокировки UI).
                  setSheetOpen(true);

                  // Прогрев в фоне (на случай если конкретно этот сериал не прогрелся bootstrap'ом).
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
