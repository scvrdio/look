"use client";

import React, { useEffect, useRef, useState } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";

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

type PreloadResponse = {
  seasonsBySeries: Record<string, SeasonRow[]>;
  episodesBySeason: Record<string, EpisodeRow[]>;
};

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

function BootGate({ children }: { children: React.ReactNode }) {
  const { mutate: mutateGlobal } = useSWRConfig();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const didBootRef = useRef(false);

  useEffect(() => {
    if (didBootRef.current) return;
    didBootRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setReady(false);

        // если уже делали boot в этой сессии — не повторяем
        try {
          if (sessionStorage.getItem("boot_done") === "1") {
            setReady(true);
            return;
          }
        } catch { }

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

        // 1) auth (cookie)
        await telegramAuthIfNeeded();
        if (cancelled) return;

        // 2) series list
        const series = await fetcher<SeriesRow[]>("/api/series");
        if (cancelled) return;

        await mutateGlobal("/api/series", series, { revalidate: false });

        // 3) top-3 blocking + rest background
        const rest = series.slice(3);

        // TOP-3 blocking одним запросом
        {
          const preload = await fetcher<PreloadResponse>("/api/preload?limit=3");
          if (cancelled) return;

          // seasons -> cache
          await Promise.allSettled(
            Object.entries(preload.seasonsBySeries).map(([seriesId, seasons]) =>
              mutateGlobal(`/api/series/${seriesId}/seasons`, seasons, { revalidate: false })
            )
          );

          // episodes -> cache
          await Promise.allSettled(
            Object.entries(preload.episodesBySeason).map(([seasonId, episodes]) =>
              mutateGlobal(`/api/seasons/${seasonId}/episodes`, episodes, { revalidate: false })
            )
          );
        }

        // rest in background
        {
          const CONCURRENCY_BG = 2;
          let j = 0;

          async function workerBg() {
            while (j < rest.length) {
              if (cancelled) return;
              const s = rest[j++];
              try {
                await preloadWholeSeries(s.id);
              } catch { }
            }
          }

          void Promise.all(Array.from({ length: CONCURRENCY_BG }, workerBg));
        }

        if (cancelled) return;

        try {
          sessionStorage.setItem("boot_done", "1");
        } catch { }

        setReady(true);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Boot failed");
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mutateGlobal]);

  if (!ready) {
    return (
      <main className="min-h-dvh bg-white">
        <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+56px)] pb-10">
          <div className="text-[32px] font-bold tracking-tight">Коллекция</div>
          <div className="mt-6 text-black/50">Загрузка…</div>
          <div className="mt-2 text-black/30 text-sm">
            Подгружаем первые 3 сериала целиком.
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {error ? (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-black/60 shadow-sm">
          Boot: {error}
        </div>
      ) : null}
      {children}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        keepPreviousData: true,
        dedupingInterval: 10_000,
      }}
    >
      <BootGate>{children}</BootGate>
    </SWRConfig>
  );
}
