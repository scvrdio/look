"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { Search, X, XCircleFill } from "@/icons";
import { pluralRu } from "@/lib/plural";
import { fetcher } from "@/lib/fetcher";
import { hapticImpact } from "@/lib/haptics";
import { SeriesFolderCard } from "@/components/series/SeriesFolderCard";
import { SeriesFolderPanel } from "@/components/series/SeriesFolderPanel";
import { SeriesSearchPanel } from "@/components/series/SeriesSearchPanel";
import { SeriesCard } from "@/components/series/SeriesCard";

import type { EpisodeRow, SeasonRow, SeriesRow } from "@/types/bootstrap";
import type { SeriesSearchPanelHandle } from "@/components/series/SeriesSearchPanel";

type FolderKind = "will-watch" | "completed" | "paused" | null;

type HomeContentProps = {
  items: SeriesRow[];
  resetToken: number;
  onFooterHiddenChange: (hidden: boolean) => void;
  onOpenSeries: (seriesId: string, source: FolderKind) => void;
};

const SEARCH_PLACEHOLDERS = [
  "Тед Лассо",
  "Во все тяжкие",
  "Игра престолов",
  "Очень странные дела",
  "Лучше звоните Солу",
  "Друзья",
  "Игра в кальмара",
  "Наследники",
];

export function HomeContent({
  items,
  resetToken,
  onFooterHiddenChange,
  onOpenSeries,
}: HomeContentProps) {
  const NOW_WATCHING_BASE_DELAY_MS = 220;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchPanelRef = useRef<SeriesSearchPanelHandle | null>(null);
  const homeExitTimerRef = useRef<number | null>(null);
  const nowWatchingEnterTimersRef = useRef<Map<string, number>>(new Map());
  const nowWatchingExitTimersRef = useRef<Map<string, number>>(new Map());
  const nowWatchingRenderIdsRef = useRef<string[]>([]);
  const bgPreloadRef = useRef(false);
  const { mutate: mutateGlobal, cache } = useSWRConfig();
  const [listReady, setListReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState<FolderKind>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHint, setSearchHint] = useState("");
  const [headerReady, setHeaderReady] = useState(false);
  const [showHomeContent, setShowHomeContent] = useState(true);
  const [homeExitAnimating, setHomeExitAnimating] = useState(false);
  const [nowWatchingRenderItems, setNowWatchingRenderItems] = useState<SeriesRow[]>([]);
  const [enteringNowWatchingIds, setEnteringNowWatchingIds] = useState<Set<string>>(new Set());
  const [exitingNowWatchingIds, setExitingNowWatchingIds] = useState<Set<string>>(new Set());

  const willWatchItems = useMemo(
    () =>
      items.filter((series) => {
        const percent = series.progress?.percent ?? 0;
        const last = series.progress?.last;
        return percent < 100 && last == null && !series.paused;
      }),
    [items]
  );
  const nowWatchingItems = useMemo(
    () =>
      items.filter((series) => {
        const percent = series.progress?.percent ?? 0;
        const last = series.progress?.last;
        return percent < 100 && last != null && !series.paused;
      }),
    [items]
  );
  const completedItems = useMemo(
    () => items.filter((series) => (series.progress?.percent ?? 0) >= 100),
    [items]
  );
  const pausedItems = useMemo(
    () =>
      items.filter((series) => Boolean(series.paused) && (series.progress?.percent ?? 0) < 100),
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
  const completedPosters = useMemo(
    () =>
      completedItems.map((series) => ({
        id: series.id,
        title: series.title,
        posterUrl: series.posterUrl,
      })),
    [completedItems]
  );
  const hasPausedItems = pausedItems.length > 0;
  const resolvedFolderTitle =
    folderOpen === "paused"
      ? "На паузе"
      : folderOpen === "completed"
        ? "Просмотрено"
        : "Буду смотреть";
  const resolvedFolderItems =
    folderOpen === "paused"
      ? pausedItems
      : folderOpen === "completed"
        ? completedItems
        : willWatchItems;
  const headerSearchHasValue = searchQuery.trim().length > 0;

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
    if (searchQuery.trim().length > 0) return;

    let phraseIndex = 0;
    let charIndex = 0;
    let typing = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const full = SEARCH_PLACEHOLDERS[phraseIndex];
      if (typing) {
        charIndex++;
        setSearchHint(full.slice(0, charIndex));
        if (charIndex >= full.length) {
          typing = false;
          timeout = setTimeout(tick, 1000);
          return;
        }
        timeout = setTimeout(tick, 125);
        return;
      }

      charIndex--;
      setSearchHint(full.slice(0, charIndex));
      if (charIndex <= 0) {
        typing = true;
        phraseIndex = (phraseIndex + 1) % SEARCH_PLACEHOLDERS.length;
        timeout = setTimeout(tick, 300);
        return;
      }
      timeout = setTimeout(tick, 60);
    };

    setSearchHint("");
    timeout = setTimeout(tick, 0);

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!searchOpen) return;
    searchPanelRef.current?.setQuery(searchQuery);
  }, [searchOpen, searchQuery]);

  useEffect(() => {
    let raf2 = 0;
    setHeaderReady(false);

    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setHeaderReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [resetToken]);

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
  }, [searchOpen, folderOpen, items.length]);

  useEffect(() => {
    if (!listReady) return;
    if (!items.length) return;
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
    onFooterHiddenChange(Boolean(searchOpen || folderOpen));
  }, [searchOpen, folderOpen, onFooterHiddenChange]);

  useEffect(() => {
    if (resetToken === 0) return;
    if (homeExitTimerRef.current !== null) {
      window.clearTimeout(homeExitTimerRef.current);
      homeExitTimerRef.current = null;
    }
    setListReady(false);
    setFolderOpen(null);
    setSearchOpen(false);
    setHomeExitAnimating(false);
    setShowHomeContent(true);
  }, [resetToken]);

  useEffect(() => {
    const enterTimers = nowWatchingEnterTimersRef.current;
    const exitTimers = nowWatchingExitTimersRef.current;

    return () => {
      if (homeExitTimerRef.current !== null) {
        window.clearTimeout(homeExitTimerRef.current);
      }
      for (const timer of enterTimers.values()) {
        window.clearTimeout(timer);
      }
      enterTimers.clear();
      for (const timer of exitTimers.values()) {
        window.clearTimeout(timer);
      }
      exitTimers.clear();
    };
  }, []);

  function openSearchPanel() {
    if (homeExitTimerRef.current !== null) {
      window.clearTimeout(homeExitTimerRef.current);
      homeExitTimerRef.current = null;
    }

    if (!searchOpen) {
      hapticImpact("light");
    }
    setFolderOpen(null);
    setSearchOpen(true);
    if (showHomeContent) {
      setHomeExitAnimating(true);
      homeExitTimerRef.current = window.setTimeout(() => {
        setShowHomeContent(false);
        setHomeExitAnimating(false);
        homeExitTimerRef.current = null;
      }, 220);
    }
  }

  function closeSearchPanel() {
    if (homeExitTimerRef.current !== null) {
      window.clearTimeout(homeExitTimerRef.current);
      homeExitTimerRef.current = null;
    }
    setListReady(false);
    setSearchOpen(false);
    setHomeExitAnimating(false);
    setShowHomeContent(true);
    searchInputRef.current?.blur();
  }

  function handleSearchInputChange(value: string) {
    if (!searchOpen) {
      openSearchPanel();
    }
    setSearchQuery(value);
    searchPanelRef.current?.setQuery(value);
  }

  function clearSearchInput() {
    hapticImpact("light");
    setSearchQuery("");
    searchPanelRef.current?.clear();
    searchInputRef.current?.focus({ preventScroll: true });
  }

  function submitSearchFromHeader() {
    if (!searchOpen) {
      openSearchPanel();
      requestAnimationFrame(() => {
        searchPanelRef.current?.search(searchQuery);
      });
      return;
    }
    searchPanelRef.current?.search(searchQuery);
  }

  function openFolder(kind: Exclude<FolderKind, null>) {
    hapticImpact("light");
    setListReady(false);
    setSearchOpen(false);
    setFolderOpen(kind);
  }

  function closeFolder() {
    setListReady(false);
    setFolderOpen(null);
  }

  if (folderOpen) {
    return (
      <SeriesFolderPanel
        title={resolvedFolderTitle}
        items={resolvedFolderItems}
        onBack={closeFolder}
        onOpenSeries={(seriesId) => onOpenSeries(seriesId, folderOpen)}
      />
    );
  }

  return (
    <>
      <div
        className={[
          "transition-all duration-500 ease-out",
          headerReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-5 blur-[10px]",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="relative h-[34px] min-w-0 flex-1">
            <h1
              className={[
                "absolute inset-0 pl-1 ty-h1-display text-black transition-opacity duration-200 ease-out",
                searchOpen ? "opacity-0" : "opacity-100",
              ].join(" ")}
            >
              Библиотека
            </h1>
            <h1
              className={[
                "absolute inset-0 pl-1 ty-h1-display text-black transition-opacity duration-200 ease-out",
                searchOpen ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              Поиск
            </h1>
          </div>
          <button
            type="button"
            onClick={closeSearchPanel}
            disabled={!searchOpen}
            className={[
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-black backdrop-blur-[6px] transition-all duration-250 ease-out active:scale-95",
              searchOpen
                ? "opacity-100 scale-100 blur-0"
                : "pointer-events-none opacity-0 scale-90 blur-[6px]",
            ].join(" ")}
            aria-label="Закрыть поиск"
          >
            <XCircleFill className="h-8 w-8" />
          </button>
        </div>

        <form
          className="relative mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearchFromHeader();
            searchInputRef.current?.blur();
          }}
        >
          <input
            ref={searchInputRef}
            value={searchQuery}
            type="text"
            onFocus={openSearchPanel}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            inputMode="text"
            enterKeyHint="search"
            placeholder={searchHint}
            className="h-11 w-full rounded-full bg-black/2 px-4 pr-10 ty-body-16-medium outline-[1px] outline-black/5 placeholder:text-black/30"
          />
          <button
            type="button"
            onPointerDown={(e) => {
              if (!headerSearchHasValue) return;
              e.preventDefault();
            }}
            onClick={() => {
              if (!headerSearchHasValue) return;
              clearSearchInput();
            }}
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 pr-1 -translate-y-1/2 items-center justify-center rounded-full"
            aria-label={headerSearchHasValue ? "Очистить поиск" : "Иконка поиска"}
            disabled={!headerSearchHasValue}
          >
            {headerSearchHasValue ? (
              <X className="h-5 w-5 text-black/30" />
            ) : (
              <Search className="h-6 w-6 text-black/30" />
            )}
          </button>
        </form>
      </div>

      {showHomeContent ? (
        <div
          className={[
            "transition-[opacity,filter] duration-200 ease-out",
            searchOpen && homeExitAnimating ? "pointer-events-none opacity-0 blur-[8px]" : "opacity-100 blur-0",
          ].join(" ")}
        >
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
            <h2 className="ty-h2 text">Смотрю сейчас</h2>
            {hasPausedItems ? (
              <button
                type="button"
                onClick={() => openFolder("paused")}
                className="inline-flex h-8 shrink-0 items-center rounded-[8px] bg-[#F2F2F2] px-3 ty-caption-13-medium transition active:scale-[0.99]"
              >
                На паузе
              </button>
            ) : null}
          </div>
          <div className="mt-4 pb-3">
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
                    progressPercent={s.progress?.percent ?? 0}
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
                      onOpenSeries(s.id, null);
                    }}
                    completed={completed}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {searchOpen && !showHomeContent ? (
        <SeriesSearchPanel
          ref={searchPanelRef}
          hideHeader
          items={items}
          onBack={closeSearchPanel}
          onOpenSeries={(seriesId) => onOpenSeries(seriesId, null)}
          onAddedSeries={() => {}}
        />
      ) : null}
    </>
  );
}






