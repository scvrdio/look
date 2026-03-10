"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";

import { pluralRu } from "@/lib/plural";
import { fetcher } from "@/lib/fetcher";
import { SeriesFooterCarousel } from "@/components/series/SeriesFooterCarousel";
import { SeriesCard } from "../components/series/SeriesCard";
import { SeriesSheet } from "../components/series/SeriesSheet";
import { Button } from "@/components/ui/button";
import { hapticImpact } from "@/lib/haptics";

import type { EpisodeRow, SeasonRow, SeriesRow } from "@/types/bootstrap";

type InProgress = { inProgressCount: number };

export default function HomePage() {
  const SERIES_CACHE_KEY = "series_cache_v1";
  const { mutate: mutateGlobal, cache } = useSWRConfig();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [listReady, setListReady] = useState(false);
  const [footerReady, setFooterReady] = useState(false);
  const bgPreloadRef = useRef(false);

  // title всегда вычисляем из items, а не храним отдельно (иначе рассинхрон/"Загрузка…")
  const [pendingOpenSeriesId, setPendingOpenSeriesId] = useState<string | null>(null);

  const { data: items, mutate: mutateSeries } = useSWR<SeriesRow[]>(
    "/api/series",
    fetcher
  );

  const autoOpenSeriesId = useMemo(() => {
    if (!pendingOpenSeriesId || !items || items.length === 0) return null;
    return items.some((s) => s.id === pendingOpenSeriesId) ? pendingOpenSeriesId : null;
  }, [items, pendingOpenSeriesId]);

  const effectiveSeriesId = activeSeriesId ?? autoOpenSeriesId;
  const effectiveSheetOpen = sheetOpen || Boolean(autoOpenSeriesId);
  const activeTitle = useMemo(() => {
    if (!effectiveSeriesId) return "";
    return (items ?? []).find((s) => s.id === effectiveSeriesId)?.title ?? "";
  }, [items, effectiveSeriesId]);
  const preferredSeasonNumber = useMemo(() => {
    if (!effectiveSeriesId) return null;
    return (items ?? []).find((s) => s.id === effectiveSeriesId)?.progress?.last?.season ?? null;
  }, [items, effectiveSeriesId]);
  const preferredEpisodeNumber = useMemo(() => {
    if (!effectiveSeriesId) return null;
    return (items ?? []).find((s) => s.id === effectiveSeriesId)?.progress?.last?.episode ?? null;
  }, [items, effectiveSeriesId]);

  useEffect(() => {
    try {
      const id = sessionStorage.getItem("openSeriesId");
      sessionStorage.removeItem("openSeriesId");
      if (id) setPendingOpenSeriesId(id);
    } catch {}

    try {
      const raw = localStorage.getItem(SERIES_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SeriesRow[];
      if (!Array.isArray(parsed)) return;
      void mutateGlobal("/api/series", parsed, { revalidate: false });
    } catch {}
  }, [mutateGlobal]);

  useEffect(() => {
    if (!items) return;
    try {
      localStorage.setItem(SERIES_CACHE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  useEffect(() => {
    if (!items || items.length === 0) return;
    if (listReady) return;

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setListReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [items, listReady]);

  useEffect(() => {
    if (!listReady) return;
    if (!items || items.length === 0) return;
    if (bgPreloadRef.current) return;
    bgPreloadRef.current = true;

    let cancelled = false;
    const candidates = items.filter((s) => (s.progress?.percent ?? 0) < 100);
    const CONCURRENCY = 2;
    let idx = 0;

    async function preloadSeries(seriesId: string) {
      const seasonsKey = `/api/series/${seriesId}/seasons`;
      let seasons: SeasonRow[] | null = null;

      const cachedSeasons = cache.get(seasonsKey) as { data?: SeasonRow[] } | undefined;
      if (Array.isArray(cachedSeasons?.data)) {
        seasons = cachedSeasons.data;
      } else {
        seasons = await fetcher<SeasonRow[]>(seasonsKey);
        await mutateGlobal(seasonsKey, seasons, { revalidate: false });
      }

      for (const season of seasons ?? []) {
        if (cancelled) return;
        const episodesKey = `/api/seasons/${season.id}/episodes`;
        const cachedEpisodes = cache.get(episodesKey) as { data?: EpisodeRow[] } | undefined;
        if (Array.isArray(cachedEpisodes?.data)) continue;

        const episodes = await fetcher<EpisodeRow[]>(episodesKey);
        await mutateGlobal(episodesKey, episodes, { revalidate: false });
      }
    }

    async function worker() {
      while (!cancelled && idx < candidates.length) {
        const current = candidates[idx++];
        try {
          await preloadSeries(current.id);
        } catch {}
      }
    }

    void Promise.all(Array.from({ length: CONCURRENCY }, worker));

    return () => {
      cancelled = true;
    };
  }, [listReady, items, mutateGlobal, cache]);

  useEffect(() => {
    if (!Array.isArray(items) || items.length === 0) {
      setFooterReady(false);
      return;
    }

    const raf = window.requestAnimationFrame(() => setFooterReady(true));
    return () => window.cancelAnimationFrame(raf);
  }, [items]);

  function getCachedData<T>(key: string): T | undefined {
    const cached = cache.get(key) as { data?: T } | T | undefined;
    if (!cached) return undefined;
    if (typeof cached === "object" && cached !== null && "data" in cached) {
      return (cached as { data?: T }).data;
    }
    return cached as T;
  }

  async function addEpisodeToProgress(seriesId: string) {
    const target = (items ?? []).find((s) => s.id === seriesId);
    if (!target) return;
    if ((target.progress?.percent ?? 0) >= 100) return;

    const prevPercent = target.progress?.percent ?? 0;
    const prevWatchedApprox = Math.round((prevPercent / 100) * target.episodesCount);
    const nextWatchedApprox = Math.min(target.episodesCount, prevWatchedApprox + 1);
    const nextPercent =
      target.episodesCount > 0
        ? Math.min(100, Math.round((nextWatchedApprox / target.episodesCount) * 100))
        : 100;
    const prevLast = target.progress?.last ?? { season: 1, episode: 0 };

    // Optimistic UI first: user sees the new progress immediately.
    await mutateSeries(
      (current) =>
        (current ?? []).map((series) => {
          if (series.id !== seriesId) return series;
          return {
            ...series,
            progress: {
              percent: nextPercent,
              last: {
                season: prevLast.season,
                episode: prevLast.episode + 1,
              },
            },
          };
        }),
      false
    );

    const becameCompleted = prevPercent < 100 && nextPercent >= 100;
    if (becameCompleted) {
      await mutateGlobal(
        "/api/series/in-progress-count",
        (current: InProgress | undefined) => ({
          inProgressCount: Math.max(0, (current?.inProgressCount ?? 0) - 1),
        }),
        { revalidate: false }
      );
    }

    try {
      const seasonsKey = `/api/series/${seriesId}/seasons`;
      const cachedSeasons = getCachedData<SeasonRow[]>(seasonsKey);
      const seasons = Array.isArray(cachedSeasons)
        ? cachedSeasons
        : await fetcher<SeasonRow[]>(seasonsKey);
      if (!Array.isArray(cachedSeasons)) {
        await mutateGlobal(seasonsKey, seasons, { revalidate: false });
      }

      const orderedSeasons = [...(seasons ?? [])].sort((a, b) => a.number - b.number);

      for (const season of orderedSeasons) {
        const episodesKey = `/api/seasons/${season.id}/episodes`;
        const cachedEpisodes = getCachedData<EpisodeRow[]>(episodesKey);
        const episodes = Array.isArray(cachedEpisodes)
          ? cachedEpisodes
          : await fetcher<EpisodeRow[]>(episodesKey);
        if (!Array.isArray(cachedEpisodes)) {
          await mutateGlobal(episodesKey, episodes, { revalidate: false });
        }

        const nextEpisode = [...(episodes ?? [])]
          .sort((a, b) => a.number - b.number)
          .find((episode) => !episode.watched);

        if (!nextEpisode) continue;

        await mutateGlobal(
          episodesKey,
          (current: EpisodeRow[] | undefined) =>
            (current ?? episodes).map((episode) =>
              episode.id === nextEpisode.id ? { ...episode, watched: true } : episode
            ),
          { revalidate: false }
        );

        const res = await fetch(`/api/episodes/${nextEpisode.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ watched: true }),
        });

        if (!res.ok) {
          throw new Error(`PATCH /api/episodes/${nextEpisode.id} failed with ${res.status}`);
        }

        void mutateSeries();
        void mutateGlobal("/api/series/in-progress-count");
        return;
      }

      void mutateSeries();
      void mutateGlobal("/api/series/in-progress-count");
    } catch {
      // Rollback to server state if request failed.
      await Promise.all([
        mutateSeries(),
        mutateGlobal("/api/series/in-progress-count"),
      ]);
    }
  }

  return (
    <main className="h-dvh bg-black">
      <style jsx>{`
        .footer-shell {
          display: grid;
          grid-template-rows: 0fr;
          opacity: 0;
          pointer-events: none;
          transition: grid-template-rows 760ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease-out;
          will-change: grid-template-rows, opacity;
        }

        .footer-shell--ready {
          grid-template-rows: 1fr;
          opacity: 1;
          pointer-events: auto;
        }

        .footer-shell__inner {
          overflow: hidden;
          min-height: 0;
        }
      `}</style>

      <div className="mx-auto flex h-dvh w-full max-w-[420px] flex-col overflow-visible bg-black">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible no-scrollbar rounded-b-[48px] bg-white px-4 pt-[calc(var(--tg-content-safe-top,0px)+64px)] flex flex-col">
          <div className="">
            <h1
              className="pl-1 text-[32px] font-black leading-[0.92] text-black"
              style={{ fontVariationSettings: '"wdth" 75', fontStretch: "75%" }}
            >
              Библиотека
            </h1>
          </div>

          <div className="mt-6 space-y-2">
          {(items ?? []).map((s, i) => {
            const rightTop = s.progress?.last
              ? `S${s.progress.last.season} E${s.progress.last.episode}`
              : "";

            const rightBottom = `${s.progress?.percent ?? 0}%`;
            const completed = (s.progress?.percent ?? 0) === 100;

            return (
              <div
                key={s.id}
                style={{ transitionDelay: `${i * 80}ms` }}
                className={[
                  "transition-all duration-500 ease-out",
                  listReady
                    ? "opacity-100 translate-y-0 blur-0"
                    : "opacity-0 translate-y-12 blur-[8px]",
                ].join(" ")}
              >
                <SeriesCard
                  id={s.id}
                  title={s.title}
                  posterUrl={s.posterUrl ?? undefined}
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
                    hapticImpact("light");
                    setActiveSeriesId(s.id);
                    setSheetOpen(true);
                  }}
                  completed={completed}
                />
              </div>
            );
          })}
          </div>

        <div className="mt-auto pt-5 sticky bottom-4 z-10">
          <Link
            href="/add"
            className="block"
            onClick={() => hapticImpact("light")}
          >
            <Button>Добавить</Button>
          </Link>
        </div>
      </div>

      {Array.isArray(items) && items.length > 0 ? (
        <div
          className={[
            "shrink-0 footer-shell",
            footerReady ? "footer-shell--ready" : "",
          ].join(" ")}
        >
          <div
            className={[
              "footer-shell__inner transition-all duration-500 ease-out",
              footerReady ? "opacity-100 blur-0" : "opacity-0 blur-[8px]",
            ].join(" ")}
          >
            <SeriesFooterCarousel
              items={items}
              onOpenSeries={(seriesId) => {
                hapticImpact("light");
                setActiveSeriesId(seriesId);
                setSheetOpen(true);
              }}
              onAddEpisode={(seriesId) => addEpisodeToProgress(seriesId)}
            />
          </div>
        </div>
      ) : null}
      </div>

      <SeriesSheet
        key={effectiveSeriesId}
        open={effectiveSheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setPendingOpenSeriesId(null);
          }
        }}
        seriesId={effectiveSeriesId}
        title={activeTitle}
        preferredSeasonNumber={preferredSeasonNumber}
        preferredEpisodeNumber={preferredEpisodeNumber}
        onChanged={() => void mutateSeries()}
      />
    </main>
  );
}
