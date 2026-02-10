"use client";

import { useEffect, useState } from "react";
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

type SeasonRow = { id: string; number: number; episodesCount: number };
type EpisodeRow = { id: string; number: number; watched: boolean };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForTelegramInitData(timeoutMs = 1500): Promise<string | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tg = (window as any)?.Telegram?.WebApp;
    const initData: string | undefined = tg?.initData;
    if (initData && initData.length > 0) return initData;
    await sleep(50);
  }
  return null;
}

async function telegramAuthIfNeeded() {
  const initData = await waitForTelegramInitData(2000);
  if (!initData) return;

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
}

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");

  const [bootReady, setBootReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const { mutate: mutateGlobal } = useSWRConfig();

  const { data: items, mutate: mutateSeries } = useSWR<SeriesRow[]>("/api/series", fetcher);

  useEffect(() => {
    let cancelled = false;

    // 0) если уже делали boot в этой сессии — сразу пускаем
    try {
      if (sessionStorage.getItem("boot_done") === "1") {
        setBootReady(true);
        return () => {
          cancelled = true;
        };
      }
    } catch {}

    async function preloadWholeSeries(seriesId: string) {
      const seasonsKey = `/api/series/${seriesId}/seasons`;
      const seasons = await fetcher<SeasonRow[]>(seasonsKey);
      await mutateGlobal(seasonsKey, seasons, { revalidate: false });

      for (const season of seasons) {
        const episodesKey = `/api/seasons/${season.id}/episodes`;
        const episodes = await fetcher<EpisodeRow[]>(episodesKey);
        await mutateGlobal(episodesKey, episodes, { revalidate: false });
      }
    }

    (async () => {
      try {
        setBootError(null);
        setBootReady(false);

        // 1) auth (cookie)
        await telegramAuthIfNeeded();
        if (cancelled) return;

        // 2) series list
        const series = await fetcher<SeriesRow[]>("/api/series");
        if (cancelled) return;
        await mutateGlobal("/api/series", series, { revalidate: false });

        // 3) топ-3 блокирующе, остальные — фоном
        const top = series.slice(0, 3);
        const rest = series.slice(3);

        // TOP-3 blocking
        {
          const CONCURRENCY = 2;
          let i = 0;

          async function workerTop() {
            while (i < top.length) {
              const s = top[i++];
              await preloadWholeSeries(s.id);
              if (cancelled) return;
            }
          }

          await Promise.all(Array.from({ length: CONCURRENCY }, workerTop));
        }

        // background for the rest
        {
          const CONCURRENCY_BG = 2;
          let j = 0;

          async function workerBg() {
            while (j < rest.length) {
              if (cancelled) return;
              const s = rest[j++];
              try {
                await preloadWholeSeries(s.id);
              } catch {}
            }
          }

          void Promise.all(Array.from({ length: CONCURRENCY_BG }, workerBg));
        }

        if (cancelled) return;

        // 4) помечаем, что в этой сессии boot выполнен
        try {
          sessionStorage.setItem("boot_done", "1");
        } catch {}

        setBootReady(true);
      } catch (e: any) {
        if (cancelled) return;
        setBootError(e?.message ?? "Boot failed");
        setBootReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mutateGlobal]);

  if (!bootReady) {
    return (
      <main className="min-h-dvh bg-white">
        <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+56px)] pb-10">
          <div className="text-[32px] font-bold tracking-tight">Коллекция</div>
          <div className="mt-6 text-black/50">Загрузка…</div>
          <div className="mt-2 text-black/30 text-sm">Подгружаем первые 3 сериала целиком.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+56px)] pb-28">
        <h1 className="text-[32px] ty-h1">Коллекция</h1>

        {bootError && (
          <div className="mt-4 rounded-xl border border-black/10 p-3 text-sm text-black/60">
            Прелоад не завершился: {bootError}
          </div>
        )}

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
        onChanged={() => void mutateSeries()}
      />
    </main>
  );
}
