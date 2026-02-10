"use client";

import { useEffect, useMemo, useState } from "react";
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

async function telegramAuthIfNeeded() {
  const tg = (window as any)?.Telegram?.WebApp;
  const initData = tg?.initData;
  if (!initData) return false;

  const r = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ initData }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Telegram auth failed: ${r.status} ${t}`);
  }

  return true;
}

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");

  const { mutate: mutateGlobal, cache } = useSWRConfig();

  // Важно: не делаем data = [] по умолчанию, чтобы отличать "нет данных" от "пусто"
  const seriesKey = "/api/series";
  const { data: items, mutate: mutateSeries } = useSWR<SeriesRow[]>(seriesKey, fetcher);

  // 1) Telegram auth: делаем один раз, потом один рефетч списка
  useEffect(() => {
    (async () => {
      try {
        const didAuth = await telegramAuthIfNeeded();
        // Если cookie могла измениться — дёргаем список один раз.
        if (didAuth) await mutateSeries();
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // helper: прогреть сезоны и эпизоды первого сезона ДО открытия sheet
  async function prefetchSheetData(seriesId: string) {
    const seasonsKey = `/api/series/${seriesId}/seasons`;

    // 1) seasons: если уже в кеше — не дергаем сеть
    let seasons = cache.get(seasonsKey) as SeasonRow[] | undefined;
    if (!seasons) {
      seasons = await mutateGlobal(
        seasonsKey,
        fetcher<SeasonRow[]>(seasonsKey),
        { populateCache: true, revalidate: false }
      );
    }

    // 2) episodes of first season: прогреваем только первый сезон (дальше догрузится по кликам)
    const firstSeasonId = seasons?.[0]?.id;
    if (firstSeasonId) {
      const episodesKey = `/api/seasons/${firstSeasonId}/episodes`;
      if (!cache.get(episodesKey)) {
        await mutateGlobal(
          episodesKey,
          fetcher(episodesKey),
          { populateCache: true, revalidate: false }
        );
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
                onClick={async () => {
                  // 0) выставляем активный сериал
                  setActiveSeriesId(s.id);
                  setActiveTitle(s.title);

                  // 1) прогреваем кеш (сезоны + эпизоды первого сезона)
                  // делаем ДО открытия шторки, чтобы при первом открытии не было "холода"
                  try {
                    await prefetchSheetData(s.id);
                  } catch (e) {
                    console.error(e);
                    // даже если префетч упал — всё равно откроем
                  }

                  // 2) открываем
                  setSheetOpen(true);
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
        onChanged={() => mutateSeries()}
      />
    </main>
  );
}
