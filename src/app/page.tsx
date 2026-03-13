"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { HomeContent } from "@/components/home/HomeContent";
import { HomeFooter } from "@/components/home/HomeFooter";
import { SeriesSheet } from "@/components/series/SeriesSheet";
import { fetcher } from "@/lib/fetcher";

import type { EpisodeRow, SeasonRow, SeriesRow } from "@/types/bootstrap";

type InProgress = { inProgressCount: number };
type OpenSource = "will-watch" | "completed" | "paused" | null;

const SERIES_CACHE_KEY = "series_cache_v2";
const LAST_MARKED_SERIES_KEY = "last_marked_series_id";
const SERIES_SHEET_CLOSE_MS = 560;

export default function HomePage() {
  const { mutate: mutateGlobal, cache } = useSWRConfig();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [pendingOpenSeriesId, setPendingOpenSeriesId] = useState<string | null>(null);
  const [initialFooterSeriesId, setInitialFooterSeriesId] = useState<string | null>(null);
  const [bottomRounded, setBottomRounded] = useState(false);
  const [footerHidden, setFooterHidden] = useState(false);
  const [contentResetToken, setContentResetToken] = useState(0);
  const resumeFromPausedRef = useRef(false);
  const startedFromWillWatchRef = useRef(false);
  const currentOpenSourceRef = useRef<OpenSource>(null);
  const closeCleanupTimerRef = useRef<number | null>(null);

  const { data: items = [], mutate: mutateSeries } = useSWR<SeriesRow[]>(
    "/api/series",
    fetcher
  );

  useEffect(() => {
    void mutateSeries();
  }, [mutateSeries]);

  useEffect(() => {
    try {
      const seriesId = sessionStorage.getItem("openSeriesId");
      sessionStorage.removeItem("openSeriesId");
      if (seriesId) {
        setPendingOpenSeriesId(seriesId);
      }
    } catch {}

    try {
      const seriesId = localStorage.getItem(LAST_MARKED_SERIES_KEY);
      if (seriesId) {
        setInitialFooterSeriesId(seriesId);
      }
    } catch {}

    try {
      const raw = localStorage.getItem(SERIES_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SeriesRow[];
      if (!Array.isArray(parsed)) return;
      void mutateGlobal("/api/series", parsed, { revalidate: true });
    } catch {}
  }, [mutateGlobal]);

  useEffect(() => {
    try {
      localStorage.setItem(SERIES_CACHE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const autoOpenSeriesId = useMemo(() => {
    if (!pendingOpenSeriesId) return null;
    return items.some((series) => series.id === pendingOpenSeriesId)
      ? pendingOpenSeriesId
      : null;
  }, [items, pendingOpenSeriesId]);

  const effectiveSeriesId = activeSeriesId ?? autoOpenSeriesId;
  const effectiveSheetOpen = sheetOpen || Boolean(autoOpenSeriesId);
  const activeSeries = useMemo(
    () => items.find((series) => series.id === effectiveSeriesId) ?? null,
    [items, effectiveSeriesId]
  );

  function rememberLastMarkedSeries(seriesId: string) {
    try {
      localStorage.setItem(LAST_MARKED_SERIES_KEY, seriesId);
    } catch {}
  }

  function openSeriesSheet(seriesId: string, source: OpenSource) {
    if (closeCleanupTimerRef.current !== null) {
      window.clearTimeout(closeCleanupTimerRef.current);
      closeCleanupTimerRef.current = null;
    }
    currentOpenSourceRef.current = source;
    resumeFromPausedRef.current = false;
    startedFromWillWatchRef.current = false;
    setActiveSeriesId(seriesId);
    setSheetOpen(true);
  }

  useEffect(() => {
    return () => {
      if (closeCleanupTimerRef.current !== null) {
        window.clearTimeout(closeCleanupTimerRef.current);
      }
    };
  }, []);

  function getCachedData<T>(key: string): T | undefined {
    const cached = cache.get(key) as { data?: T } | T | undefined;
    if (!cached) return undefined;
    if (typeof cached === "object" && cached !== null && "data" in cached) {
      return (cached as { data?: T }).data;
    }
    return cached as T;
  }

  function resolveNextLastEpisode(
    prevLast: { season: number; episode: number },
    seasons: SeasonRow[] | undefined
  ) {
    if (!Array.isArray(seasons) || seasons.length === 0) {
      return { season: prevLast.season, episode: prevLast.episode + 1 };
    }

    const ordered = [...seasons].sort((a, b) => a.number - b.number);
    const seasonIndex = ordered.findIndex((season) => season.number === prevLast.season);
    if (seasonIndex === -1) {
      return { season: prevLast.season, episode: prevLast.episode + 1 };
    }

    const currentSeason = ordered[seasonIndex];
    if (prevLast.episode < currentSeason.episodesCount) {
      return { season: currentSeason.number, episode: prevLast.episode + 1 };
    }

    const nextSeason = ordered[seasonIndex + 1];
    if (nextSeason) {
      return { season: nextSeason.number, episode: 1 };
    }

    return { season: currentSeason.number, episode: currentSeason.episodesCount };
  }

  async function addEpisodeToProgress(seriesId: string) {
    let optimisticPrevPercent = 0;
    let optimisticNextPercent = 0;
    let hasOptimisticUpdate = false;

    await mutateSeries(
      (current) =>
        (current ?? []).map((series) => {
          if (series.id !== seriesId) return series;
          const prevPercent = series.progress?.percent ?? 0;
          if (prevPercent >= 100) return series;

          const prevLast = series.progress?.last ?? { season: 1, episode: 0 };
          const seasonsKey = `/api/series/${seriesId}/seasons`;
          const cachedSeasons = getCachedData<SeasonRow[]>(seasonsKey);
          const nextLast = resolveNextLastEpisode(prevLast, cachedSeasons);
          const prevWatchedApprox = Math.round((prevPercent / 100) * series.episodesCount);
          const nextWatchedApprox = Math.min(series.episodesCount, prevWatchedApprox + 1);
          const nextPercent =
            series.episodesCount > 0
              ? Math.min(100, Math.round((nextWatchedApprox / series.episodesCount) * 100))
              : 100;

          optimisticPrevPercent = prevPercent;
          optimisticNextPercent = nextPercent;
          hasOptimisticUpdate = true;

          return {
            ...series,
            progress: {
              percent: nextPercent,
              last: nextLast,
            },
          };
        }),
      false
    );

    if (!hasOptimisticUpdate) return;
    rememberLastMarkedSeries(seriesId);

    const becameCompleted = optimisticPrevPercent < 100 && optimisticNextPercent >= 100;
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

        const response = await fetch(`/api/episodes/${nextEpisode.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ watched: true }),
        });

        if (!response.ok) {
          throw new Error(`PATCH /api/episodes/${nextEpisode.id} failed with ${response.status}`);
        }

        void mutateSeries();
        void mutateGlobal("/api/series/in-progress-count");
        return;
      }

      void mutateSeries();
      void mutateGlobal("/api/series/in-progress-count");
    } catch {
      await Promise.all([mutateSeries(), mutateGlobal("/api/series/in-progress-count")]);
    }
  }

  return (
    <main className="h-dvh overflow-hidden overscroll-none bg-black">
      <div className="mx-auto flex h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-black">
        <div
          className={[
            "min-h-0 flex flex-1 flex-col overflow-y-auto overflow-x-visible overscroll-y-contain no-scrollbar bg-white px-4 pt-[calc(var(--tg-content-safe-top,0px)+64px)]",
            footerHidden
              ? "transition-none"
              : "transition-[border-bottom-left-radius,border-bottom-right-radius] duration-[560ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
            bottomRounded ? "rounded-b-[32px]" : "rounded-b-none",
          ].join(" ")}
        >
          <HomeContent
            items={items}
            resetToken={contentResetToken}
            onFooterHiddenChange={setFooterHidden}
            onOpenSeries={openSeriesSheet}
          />
        </div>

        <HomeFooter
          hidden={footerHidden}
          initialSeriesId={initialFooterSeriesId}
          items={items}
          onAddEpisode={addEpisodeToProgress}
          onOpenSeries={openSeriesSheet}
          onRoundedChange={setBottomRounded}
        />
      </div>

      <SeriesSheet
        open={effectiveSheetOpen}
        onOpenChange={(open) => {
          if (closeCleanupTimerRef.current !== null) {
            window.clearTimeout(closeCleanupTimerRef.current);
            closeCleanupTimerRef.current = null;
          }

          setSheetOpen(open);
          if (open) return;

          setPendingOpenSeriesId(null);

          const shouldResetContent =
            (currentOpenSourceRef.current === "paused" && resumeFromPausedRef.current) ||
            (currentOpenSourceRef.current === "will-watch" && startedFromWillWatchRef.current);

          if (shouldResetContent) {
            setContentResetToken((prev) => prev + 1);
          }

          currentOpenSourceRef.current = null;
          resumeFromPausedRef.current = false;
          startedFromWillWatchRef.current = false;
          closeCleanupTimerRef.current = window.setTimeout(() => {
            setActiveSeriesId(null);
            closeCleanupTimerRef.current = null;
          }, SERIES_SHEET_CLOSE_MS);
        }}
        seriesId={effectiveSeriesId}
        title={activeSeries?.title ?? ""}
        progressPercent={activeSeries?.progress?.percent ?? 0}
        paused={Boolean(activeSeries?.paused)}
        preferredSeasonNumber={activeSeries?.progress?.last?.season ?? null}
        preferredEpisodeNumber={activeSeries?.progress?.last?.episode ?? null}
        onResumedFromPause={() => {
          resumeFromPausedRef.current = true;
        }}
        onProgressStarted={() => {
          startedFromWillWatchRef.current = true;
          if (effectiveSeriesId) {
            rememberLastMarkedSeries(effectiveSeriesId);
          }
        }}
        onChanged={() => void mutateSeries()}
      />
    </main>
  );
}
