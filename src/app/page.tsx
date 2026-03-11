"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { pluralRu } from "@/lib/plural";
import { fetcher } from "@/lib/fetcher";
import { SeriesFooterCarousel } from "@/components/series/SeriesFooterCarousel";
import { SeriesSearchPanel } from "@/components/series/SeriesSearchPanel";
import { SeriesFolderCard } from "@/components/series/SeriesFolderCard";
import { SeriesFolderPanel } from "@/components/series/SeriesFolderPanel";
import { SeriesCard } from "../components/series/SeriesCard";
import { SeriesSheet } from "../components/series/SeriesSheet";
import { SearchCircleFill } from "@/icons";
import { hapticImpact } from "@/lib/haptics";

import type { EpisodeRow, SeasonRow, SeriesRow } from "@/types/bootstrap";

type InProgress = { inProgressCount: number };

export default function HomePage() {
  const SERIES_CACHE_KEY = "series_cache_v1";
  const FOOTER_ANIMATION_MS = 560;
  const NOW_WATCHING_BASE_DELAY_MS = 220;
  const { mutate: mutateGlobal, cache } = useSWRConfig();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [listReady, setListReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState<"will-watch" | "completed" | "paused" | null>(null);
  const [bottomRounded, setBottomRounded] = useState(false);
  const [footerEnterReady, setFooterEnterReady] = useState(false);
  const [nowWatchingRenderItems, setNowWatchingRenderItems] = useState<SeriesRow[]>([]);
  const [enteringNowWatchingIds, setEnteringNowWatchingIds] = useState<Set<string>>(new Set());
  const [exitingNowWatchingIds, setExitingNowWatchingIds] = useState<Set<string>>(new Set());
  const bgPreloadRef = useRef(false);
  const bottomRadiusTimerRef = useRef<number | null>(null);
  const footerEnterRaf1Ref = useRef<number | null>(null);
  const footerEnterRaf2Ref = useRef<number | null>(null);
  const footerInnerRef = useRef<HTMLDivElement | null>(null);
  const nowWatchingEnterTimersRef = useRef<Map<string, number>>(new Map());
  const nowWatchingExitTimersRef = useRef<Map<string, number>>(new Map());
  const nowWatchingRenderIdsRef = useRef<string[]>([]);
  const resumeFromPausedRef = useRef(false);
  const startedFromWillWatchRef = useRef(false);
  const [footerHeight, setFooterHeight] = useState(0);

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
  const activePosterUrl = useMemo(() => {
    if (!effectiveSeriesId) return null;
    return (items ?? []).find((s) => s.id === effectiveSeriesId)?.posterUrl ?? null;
  }, [items, effectiveSeriesId]);
  const activePaused = useMemo(() => {
    if (!effectiveSeriesId) return false;
    return Boolean((items ?? []).find((s) => s.id === effectiveSeriesId)?.paused);
  }, [items, effectiveSeriesId]);
  const preferredSeasonNumber = useMemo(() => {
    if (!effectiveSeriesId) return null;
    return (items ?? []).find((s) => s.id === effectiveSeriesId)?.progress?.last?.season ?? null;
  }, [items, effectiveSeriesId]);
  const preferredEpisodeNumber = useMemo(() => {
    if (!effectiveSeriesId) return null;
    return (items ?? []).find((s) => s.id === effectiveSeriesId)?.progress?.last?.episode ?? null;
  }, [items, effectiveSeriesId]);
  const willWatchItems = useMemo(
    () =>
      (items ?? []).filter((series) => {
        const percent = series.progress?.percent ?? 0;
        const last = series.progress?.last;
        return percent < 100 && last == null && !series.paused;
      }),
    [items]
  );
  const nowWatchingItems = useMemo(
    () =>
      (items ?? []).filter((series) => {
        const percent = series.progress?.percent ?? 0;
        const last = series.progress?.last;
        return percent < 100 && last != null && !series.paused;
      }),
    [items]
  );
  const willWatchPosters = useMemo(
    () =>
      willWatchItems.map((series) => ({
        id: series.id,
        title: series.title,
        posterUrl: series.posterUrl,
      })),
    [willWatchItems]
  );
  const completedItems = useMemo(
    () => (items ?? []).filter((series) => (series.progress?.percent ?? 0) >= 100),
    [items]
  );
  const completedPosters = useMemo(
    () =>
      completedItems.map((series) => ({
        id: series.id,
        title: series.title,
        posterUrl: series.posterUrl,
      })),
    [completedItems]
  );
  const activeFolderTitle = folderOpen === "completed" ? "Просмотрено" : "Буду смотреть";
  const activeFolderItems = folderOpen === "completed" ? completedItems : willWatchItems;

  const pausedItems = useMemo(
    () => (items ?? []).filter((series) => Boolean(series.paused) && (series.progress?.percent ?? 0) < 100),
    [items]
  );
  const hasPausedItems = pausedItems.length > 0;
  const resolvedFolderTitle = folderOpen === "paused" ? "На паузе" : activeFolderTitle;
  const resolvedFolderItems = folderOpen === "paused" ? pausedItems : activeFolderItems;

  useEffect(() => {
    nowWatchingRenderIdsRef.current = nowWatchingRenderItems.map((s) => s.id);
  }, [nowWatchingRenderItems]);

  useEffect(() => {
    const EXIT_MS = 500;
    const nextIds = new Set(nowWatchingItems.map((s) => s.id));
    const currentRenderIds = nowWatchingRenderIdsRef.current;

    for (const id of nowWatchingItems.map((s) => s.id)) {
      const enterTimer = nowWatchingEnterTimersRef.current.get(id);
      if (enterTimer) {
        window.clearTimeout(enterTimer);
        nowWatchingEnterTimersRef.current.delete(id);
      }
      const timer = nowWatchingExitTimersRef.current.get(id);
      if (!timer) continue;
      window.clearTimeout(timer);
      nowWatchingExitTimersRef.current.delete(id);
      setExitingNowWatchingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }

    for (const id of currentRenderIds) {
      if (nextIds.has(id)) continue;
      if (nowWatchingExitTimersRef.current.has(id)) continue;

      setExitingNowWatchingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      const timer = window.setTimeout(() => {
        nowWatchingExitTimersRef.current.delete(id);
        setExitingNowWatchingIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setNowWatchingRenderItems((prev) => prev.filter((item) => item.id !== id));
      }, EXIT_MS);

      nowWatchingExitTimersRef.current.set(id, timer);
    }

    const addedIds: string[] = [];
    setNowWatchingRenderItems((prev) => {
      const byId = new Map(nowWatchingItems.map((s) => [s.id, s]));
      const prevIds = new Set(prev.map((s) => s.id));
      const merged = prev.map((s) => byId.get(s.id) ?? s);
      for (const s of nowWatchingItems) {
        if (!prevIds.has(s.id)) {
          merged.push(s);
          addedIds.push(s.id);
        }
      }
      return merged;
    });

    if (addedIds.length > 0) {
      setEnteringNowWatchingIds((prev) => {
        const next = new Set(prev);
        for (const id of addedIds) next.add(id);
        return next;
      });
      for (const id of addedIds) {
        const timer = window.setTimeout(() => {
          nowWatchingEnterTimersRef.current.delete(id);
          setEnteringNowWatchingIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 40);
        nowWatchingEnterTimersRef.current.set(id, timer);
      }
    }
  }, [nowWatchingItems]);

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
    if (searchOpen || folderOpen) return;

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
  }, [searchOpen, folderOpen, items?.length]);

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

  const hasFooterItems = nowWatchingRenderItems.length > 0;
  const footerShown = hasFooterItems && !searchOpen && !folderOpen;

  useEffect(() => {
    if (footerEnterRaf1Ref.current !== null) {
      window.cancelAnimationFrame(footerEnterRaf1Ref.current);
      footerEnterRaf1Ref.current = null;
    }
    if (footerEnterRaf2Ref.current !== null) {
      window.cancelAnimationFrame(footerEnterRaf2Ref.current);
      footerEnterRaf2Ref.current = null;
    }

    if (!footerShown) {
      setFooterEnterReady(false);
      return;
    }

    setFooterEnterReady(false);
    footerEnterRaf1Ref.current = window.requestAnimationFrame(() => {
      footerEnterRaf2Ref.current = window.requestAnimationFrame(() => {
        setFooterEnterReady(true);
        footerEnterRaf1Ref.current = null;
        footerEnterRaf2Ref.current = null;
      });
    });

    return () => {
      if (footerEnterRaf1Ref.current !== null) {
        window.cancelAnimationFrame(footerEnterRaf1Ref.current);
        footerEnterRaf1Ref.current = null;
      }
      if (footerEnterRaf2Ref.current !== null) {
        window.cancelAnimationFrame(footerEnterRaf2Ref.current);
        footerEnterRaf2Ref.current = null;
      }
    };
  }, [footerShown]);

  useEffect(() => {
    const node = footerInnerRef.current;
    if (!node) return;

    const measure = () => {
      setFooterHeight(node.scrollHeight);
    };

    measure();

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hasFooterItems, items]);

  useEffect(() => {
    if (bottomRadiusTimerRef.current !== null) {
      window.clearTimeout(bottomRadiusTimerRef.current);
      bottomRadiusTimerRef.current = null;
    }

    if (footerEnterReady) {
      setBottomRounded(true);
      return;
    }

    if (!hasFooterItems) {
      setBottomRounded(false);
      return;
    }

    bottomRadiusTimerRef.current = window.setTimeout(() => {
      setBottomRounded(false);
      bottomRadiusTimerRef.current = null;
    }, FOOTER_ANIMATION_MS);
  }, [footerEnterReady, hasFooterItems, FOOTER_ANIMATION_MS]);

  useEffect(() => {
    const nowWatchingEnterTimers = nowWatchingEnterTimersRef.current;
    const nowWatchingExitTimers = nowWatchingExitTimersRef.current;
    return () => {
      if (bottomRadiusTimerRef.current !== null) {
        window.clearTimeout(bottomRadiusTimerRef.current);
      }
      if (footerEnterRaf1Ref.current !== null) {
        window.cancelAnimationFrame(footerEnterRaf1Ref.current);
      }
      if (footerEnterRaf2Ref.current !== null) {
        window.cancelAnimationFrame(footerEnterRaf2Ref.current);
      }
      for (const timer of nowWatchingEnterTimers.values()) {
        window.clearTimeout(timer);
      }
      nowWatchingEnterTimers.clear();
      for (const timer of nowWatchingExitTimers.values()) {
        window.clearTimeout(timer);
      }
      nowWatchingExitTimers.clear();
    };
  }, []);

  function openSearchPanel() {
    hapticImpact("light");
    setListReady(false);
    setFolderOpen(null);
    setSearchOpen(true);
  }

  function closeSearchPanel() {
    setListReady(false);
    setSearchOpen(false);
  }

  function openFolder(kind: "will-watch" | "completed" | "paused") {
    hapticImpact("light");
    setListReady(false);
    setSearchOpen(false);
    setFolderOpen(kind);
  }

  function closeFolder() {
    setListReady(false);
    setFolderOpen(null);
  }

  function openSeriesSheet(seriesId: string) {
    resumeFromPausedRef.current = false;
    startedFromWillWatchRef.current = false;
    setActiveSeriesId(seriesId);
    setSheetOpen(true);
  }

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
    const seasonIndex = ordered.findIndex((s) => s.number === prevLast.season);
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

    // Optimistic UI first: user sees the new progress immediately.
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
    <main className="h-dvh overflow-hidden overscroll-none bg-black">
      <div className="mx-auto flex h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-black">
        <div
          className={[
            "min-h-0 flex flex-1 flex-col overflow-y-auto overflow-x-visible overscroll-y-contain no-scrollbar bg-white px-4 pt-[calc(var(--tg-content-safe-top,0px)+64px)]",
            bottomRounded ? "rounded-b-[32px]" : "",
          ].join(" ")}
        >
          {searchOpen ? (
            <SeriesSearchPanel
              items={items ?? []}
              onBack={closeSearchPanel}
              onOpenSeries={openSeriesSheet}
              onAddedSeries={() => {
                setListReady(false);
                setSearchOpen(false);
                setFolderOpen("will-watch");
              }}
            />
          ) : folderOpen ? (
            <SeriesFolderPanel
              title={resolvedFolderTitle}
              items={resolvedFolderItems}
              onBack={closeFolder}
              onOpenSeries={openSeriesSheet}
            />
          ) : (
            <>
              <div
                className={[
                  "flex items-start justify-between gap-3 transition-all duration-500 ease-out",
                  listReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-[8px]",
                ].join(" ")}
              >
                <h1
                  className="pl-1 text-[32px] font-black leading-[0.92] text-black"
                  style={{ fontVariationSettings: '"wdth" 75', fontStretch: "75%" }}
                >
                  Библиотека
                </h1>
                <button
                  type="button"
                  onClick={openSearchPanel}
                  className="shrink-0 text-black transition-transform active:scale-95"
                  aria-label="Открыть поиск"
                >
                  <SearchCircleFill className="h-8 w-8" />
                  </button>
              </div>
              <div
                style={{ transitionDelay: "60ms" }}
                className={[
                  "mt-4 flex gap-2 transition-all duration-500 ease-out",
                  listReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-[8px]",
                ].join(" ")}
              >
                <div className="min-w-0 flex-1">
                  <SeriesFolderCard
                    title="Буду смотреть"
                    count={willWatchItems.length}
                    posters={willWatchPosters}
                    onClick={() => openFolder("will-watch")}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <SeriesFolderCard
                    title="Просмотрено"
                    count={completedItems.length}
                    posters={completedPosters}
                    onClick={() => openFolder("completed")}
                  />
                </div>
              </div>
              <div
                style={{ transitionDelay: "120ms" }}
                className={[
                  "mt-8 flex items-center justify-between gap-3 pl-1 transition-all duration-500 ease-out",
                  listReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-[8px]",
                ].join(" ")}
              >
                <h2
                  className="text-[20px] leading-[0.92] text"
                  style={{ fontVariationSettings: '"wdth" 90, "wght" 600, "opsz" 20', fontStretch: "75%" }}
                >
                  Смотрю сейчас
                </h2>
                {hasPausedItems ? (
                  <button
                    type="button"
                    onClick={() => openFolder("paused")}
                    className="inline-flex h-8 shrink-0 items-center rounded-[8px] bg-[#F2F2F2] px-3 text-[13px] font-medium transition active:scale-[0.99]"
                  >
                  На паузе →
                  </button>
                ) : null}
              </div>
              <div className="mt-4 pb-4">
                {nowWatchingRenderItems.map((s, i) => {
                  const rightTop = `S${s.progress?.last?.season ?? 1} E${s.progress?.last?.episode ?? 0}`;
                  const isEntering = enteringNowWatchingIds.has(s.id);
                  const isExiting = exitingNowWatchingIds.has(s.id);
                  const itemDelayMs = isEntering || isExiting ? 0 : NOW_WATCHING_BASE_DELAY_MS + i * 80;

                  const rightBottom = `${s.progress?.percent ?? 0}%`;
                  const completed = (s.progress?.percent ?? 0) === 100;

                  return (
                    <div
                      key={s.id}
                      style={{ transitionDelay: `${itemDelayMs}ms` }}
                      className={[
                        "overflow-hidden transition-[max-height,margin,opacity,transform,filter] duration-500 ease-out",
                        isExiting
                          ? "max-h-0 mb-0 opacity-0 -translate-y-2 blur-[6px] pointer-events-none"
                          : isEntering
                            ? "max-h-0 mb-0 opacity-0 translate-y-2 blur-[6px] pointer-events-none"
                            : listReady
                              ? "max-h-[140px] mb-2 opacity-100 translate-y-0 blur-0"
                              : "max-h-[140px] mb-2 opacity-0 translate-y-12 blur-[8px]",
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
                          if (isExiting) return;
                          hapticImpact("light");
                          openSeriesSheet(s.id);
                        }}
                        completed={completed}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {hasFooterItems ? (
          <div
            className={[
              "w-full shrink-0 overflow-hidden transition-[max-height,opacity] duration-[560ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
              footerEnterReady ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
            ].join(" ")}
            style={{ maxHeight: footerEnterReady ? `${footerHeight}px` : "0px" }}
          >
            <div ref={footerInnerRef}>
              <SeriesFooterCarousel
                items={nowWatchingItems}
                onOpenSeries={(seriesId) => {
                  hapticImpact("light");
                  openSeriesSheet(seriesId);
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
        onOpenChange={async (open) => {
          setSheetOpen(open);
          if (!open) {
            setPendingOpenSeriesId(null);
            const shouldGoHomeFromPaused = folderOpen === "paused" && resumeFromPausedRef.current;
            const shouldGoHomeFromWillWatch = folderOpen === "will-watch" && startedFromWillWatchRef.current;
            if (shouldGoHomeFromPaused || shouldGoHomeFromWillWatch) {
              setListReady(false);
              setFolderOpen(null);
            }
            resumeFromPausedRef.current = false;
            startedFromWillWatchRef.current = false;
          }
        }}
        seriesId={effectiveSeriesId}
        title={activeTitle}
        posterUrl={activePosterUrl}
        paused={activePaused}
        preferredSeasonNumber={preferredSeasonNumber}
        preferredEpisodeNumber={preferredEpisodeNumber}
        onResumedFromPause={() => {
          resumeFromPausedRef.current = true;
        }}
        onProgressStarted={() => {
          startedFromWillWatchRef.current = true;
        }}
        onChanged={() => void mutateSeries()}
      />
    </main>
  );
}
