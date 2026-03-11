"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { pluralRu } from "@/lib/plural";
import { fetcher } from "@/lib/fetcher";
import { SeriesFooterCarousel } from "@/components/series/SeriesFooterCarousel";
import { SeriesSearchPanel } from "@/components/series/SeriesSearchPanel";
import { SeriesCard } from "../components/series/SeriesCard";
import { SeriesSheet } from "../components/series/SeriesSheet";
import { SearchCircleFill } from "@/icons";
import { hapticImpact } from "@/lib/haptics";

import type { EpisodeRow, SeasonRow, SeriesRow } from "@/types/bootstrap";

type InProgress = { inProgressCount: number };

export default function HomePage() {
  const SERIES_CACHE_KEY = "series_cache_v1";
  const FOOTER_ANIMATION_MS = 560;
  const { mutate: mutateGlobal, cache } = useSWRConfig();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [listReady, setListReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bottomRounded, setBottomRounded] = useState(false);
  const [footerEnterReady, setFooterEnterReady] = useState(false);
  const bgPreloadRef = useRef(false);
  const bottomRadiusTimerRef = useRef<number | null>(null);
  const footerEnterRaf1Ref = useRef<number | null>(null);
  const footerEnterRaf2Ref = useRef<number | null>(null);
  const footerInnerRef = useRef<HTMLDivElement | null>(null);
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

  const hasFooterItems = Array.isArray(items) && items.length > 0;
  const footerShown = hasFooterItems && !searchOpen;

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
    };
  }, []);

  function openSearchPanel() {
    hapticImpact("light");
    setSearchOpen(true);
  }

  function closeSearchPanel() {
    setSearchOpen(false);
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
              onOpenSeries={(seriesId) => {
                setActiveSeriesId(seriesId);
                setSheetOpen(true);
              }}
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
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
              <div className="mt-6 space-y-2 pb-4">
                {(items ?? []).map((s, i) => {
                  const rightTop = `S${s.progress?.last?.season ?? 1} E${s.progress?.last?.episode ?? 0}`;

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
                items={items ?? []}
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
        posterUrl={activePosterUrl}
        preferredSeasonNumber={preferredSeasonNumber}
        preferredEpisodeNumber={preferredEpisodeNumber}
        onChanged={() => void mutateSeries()}
      />
    </main>
  );
}
