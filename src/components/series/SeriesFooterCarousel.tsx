"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { PlusCircleFill } from "@/icons";
import { fetcher } from "@/lib/fetcher";
import { pluralRu } from "@/lib/plural";
import { hapticImpact } from "@/lib/haptics";

import type { SeriesRow } from "@/types/bootstrap";

type SeriesFooterCarouselProps = {
  items: SeriesRow[];
  initialSeriesId?: string | null;
  onOpenSeries: (seriesId: string) => void;
  onAddEpisode: (seriesId: string) => Promise<void> | void;
};

type SeasonProgressView = {
  season: number;
  episode: number;
  episodesCount: number;
};

export function SeriesFooterCarousel({
  items,
  initialSeriesId = null,
  onOpenSeries,
  onAddEpisode,
}: SeriesFooterCarouselProps) {
  type SeasonRow = { id: string; number: number; episodesCount: number };
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const titlesScrollRef = useRef<HTMLDivElement | null>(null);
  const titleButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const titleTargetScrollLeftRef = useRef(0);
  const titleCurrentScrollLeftRef = useRef(0);
  const titleSyncRafRef = useRef<number | null>(null);
  const { cache, mutate: mutateGlobal } = useSWRConfig();
  const pointerIdRef = useRef<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const swipeUpArmedRef = useRef(false);
  const loopingAdjustRef = useRef(false);
  const activeCardGlobalIndexRef = useRef(0);
  const initLoopPositionRef = useRef(false);
  const loopSettleTimerRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shouldLoopTitles, setShouldLoopTitles] = useState(false);
  const [seasonProgressViewBySeriesId, setSeasonProgressViewBySeriesId] = useState<
    Record<string, SeasonProgressView>
  >({});

  const inProgressItems = useMemo(
    () => items.filter((s) => (s.progress?.percent ?? 0) < 100),
    [items]
  );
  const cardLoopCycles = inProgressItems.length > 2 ? 3 : 1;
  const loopedItems = useMemo(() => {
    if (inProgressItems.length <= 1) return inProgressItems;
    return Array.from({ length: cardLoopCycles }, () => inProgressItems).flat();
  }, [inProgressItems, cardLoopCycles]);
  const titleLoopCycles = shouldLoopTitles && inProgressItems.length > 2 ? 3 : 1;
  const titleLoopedItems = useMemo(() => {
    if (inProgressItems.length <= 1) return inProgressItems;
    return Array.from({ length: titleLoopCycles }, () => inProgressItems).flat();
  }, [inProgressItems, titleLoopCycles]);
  useEffect(() => {
    initLoopPositionRef.current = false;
    titleButtonRefs.current = [];
    activeCardGlobalIndexRef.current = 0;
  }, [inProgressItems.length, cardLoopCycles, titleLoopCycles]);

  useEffect(() => {
    return () => {
      if (titleSyncRafRef.current !== null) {
        window.cancelAnimationFrame(titleSyncRafRef.current);
        titleSyncRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const node = titlesScrollRef.current;
    if (!node) return;

    const computeShouldLoopTitles = () => {
      if (inProgressItems.length <= 2) {
        setShouldLoopTitles(false);
        return;
      }

      const baseButtons = titleButtonRefs.current.slice(0, inProgressItems.length);
      if (baseButtons.length < inProgressItems.length || baseButtons.some((button) => !button)) return;

      const totalTitlesWidth = baseButtons.reduce((sum, button) => sum + (button?.offsetWidth ?? 0), 0);
      const gapsWidth = Math.max(0, inProgressItems.length - 1) * 24; // gap-6
      const contentWidth = totalTitlesWidth + gapsWidth;
      const availableWidth = Math.max(0, node.clientWidth - 48); // px-6 left/right
      const nextShouldLoop = contentWidth > availableWidth;

      setShouldLoopTitles((prev) => (prev === nextShouldLoop ? prev : nextShouldLoop));
    };

    const rafId = window.requestAnimationFrame(computeShouldLoopTitles);
    const ro = new ResizeObserver(computeShouldLoopTitles);
    ro.observe(node);
    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [inProgressItems, titleLoopedItems.length]);

  const centerTitlesToGlobalIndex = useCallback((globalIndex: number, behavior: ScrollBehavior = "auto") => {
    const node = titlesScrollRef.current;
    const resolvedIndex = titleLoopCycles === 1 && inProgressItems.length > 0
      ? ((globalIndex % inProgressItems.length) + inProgressItems.length) % inProgressItems.length
      : globalIndex;
    const button = titleButtonRefs.current[resolvedIndex];
    if (!node || !button) return;

    const targetLeft = button.offsetLeft - (node.clientWidth - button.clientWidth) / 2;
    const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const left = Math.max(0, Math.min(targetLeft, maxLeft));
    node.scrollTo({ left, behavior });
  }, [inProgressItems.length, titleLoopCycles]);

  const syncTitlesToCardsPosition = useCallback((cards: HTMLElement[], cardsCenter: number) => {
    const titlesNode = titlesScrollRef.current;
    if (!titlesNode || !cards.length) return;

    const titleCenters = titleButtonRefs.current.map((button) =>
      button ? button.offsetLeft + button.clientWidth / 2 : null
    );
    if (!titleCenters.length) return;

    const cardCenters = cards.map((card) => card.offsetLeft + card.clientWidth / 2);
    let rightIndex = cardCenters.findIndex((x) => x >= cardsCenter);
    if (rightIndex < 0) rightIndex = cardCenters.length - 1;
    const leftIndex = Math.max(0, rightIndex - 1);

    const resolveTitleIndex = (cardIndex: number) =>
      titleLoopCycles === 1 && inProgressItems.length > 0
        ? ((cardIndex % inProgressItems.length) + inProgressItems.length) % inProgressItems.length
        : cardIndex;

    const leftCardCenter = cardCenters[leftIndex];
    const rightCardCenter = cardCenters[rightIndex];
    const leftTitleCenter = titleCenters[resolveTitleIndex(leftIndex)];
    const rightTitleCenter = titleCenters[resolveTitleIndex(rightIndex)];
    if (leftTitleCenter == null || rightTitleCenter == null) return;

    const range = rightCardCenter - leftCardCenter;
    const t = range <= 0 ? 0 : (cardsCenter - leftCardCenter) / range;
    const targetCenter = leftTitleCenter + (rightTitleCenter - leftTitleCenter) * Math.max(0, Math.min(1, t));
    const targetLeft = targetCenter - titlesNode.clientWidth / 2;
    const maxLeft = Math.max(0, titlesNode.scrollWidth - titlesNode.clientWidth);
    titleTargetScrollLeftRef.current = Math.max(0, Math.min(targetLeft, maxLeft));

    if (titleSyncRafRef.current !== null) return;
    titleCurrentScrollLeftRef.current = titlesNode.scrollLeft;

    const step = () => {
      const node = titlesScrollRef.current;
      if (!node) {
        titleSyncRafRef.current = null;
        return;
      }

      const current = titleCurrentScrollLeftRef.current;
      const target = titleTargetScrollLeftRef.current;
      const next = current + (target - current) * 0.28;
      titleCurrentScrollLeftRef.current = next;
      node.scrollLeft = next;

      if (Math.abs(target - next) < 0.4) {
        node.scrollLeft = target;
        titleCurrentScrollLeftRef.current = target;
        titleSyncRafRef.current = null;
        return;
      }

      titleSyncRafRef.current = window.requestAnimationFrame(step);
    };

    titleSyncRafRef.current = window.requestAnimationFrame(step);
  }, [inProgressItems.length, titleLoopCycles]);

  useEffect(() => {
    let cancelled = false;

    async function loadSeasonEpisodeCounts() {
      const nextMap: Record<string, SeasonProgressView> = {};

      for (const series of inProgressItems) {
        const seasonNumber = series.progress?.last?.season;
        const episodeNumber = series.progress?.last?.episode ?? 0;
        if (!seasonNumber) continue;

        const seasonsKey = `/api/series/${series.id}/seasons`;
        const cached = cache.get(seasonsKey) as { data?: SeasonRow[] } | SeasonRow[] | undefined;
        const cachedData =
          Array.isArray(cached) ? cached : cached && "data" in cached ? cached.data : undefined;

        const seasons = Array.isArray(cachedData)
          ? cachedData
          : await fetcher<SeasonRow[]>(seasonsKey);

        if (!Array.isArray(cachedData)) {
          await mutateGlobal(seasonsKey, seasons, { revalidate: false });
        }

        const orderedSeasons = [...(seasons ?? [])].sort((a, b) => a.number - b.number);
        const currentIndex = orderedSeasons.findIndex((s) => s.number === seasonNumber);
        if (currentIndex < 0) continue;

        const currentSeason = orderedSeasons[currentIndex];
        const nextSeason = orderedSeasons[currentIndex + 1];

        if (episodeNumber >= currentSeason.episodesCount && nextSeason) {
          nextMap[series.id] = {
            season: nextSeason.number,
            episode: 0,
            episodesCount: nextSeason.episodesCount,
          };
          continue;
        }

        nextMap[series.id] = {
          season: currentSeason.number,
          episode: episodeNumber,
          episodesCount: currentSeason.episodesCount,
        };
      }

      if (!cancelled) {
        setSeasonProgressViewBySeriesId(nextMap);
      }
    }

    void loadSeasonEpisodeCounts();

    return () => {
      cancelled = true;
    };
  }, [inProgressItems, cache, mutateGlobal]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const handleScroll = () => {
      if (loopingAdjustRef.current) return;
      const cards = Array.from(
        node.querySelectorAll<HTMLElement>('[data-carousel-card="true"]')
      );
      if (!cards.length) {
        setActiveIndex(0);
        return;
      }
      const center = node.scrollLeft + node.clientWidth / 2;
      syncTitlesToCardsPosition(cards, center);
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      cards.forEach((card, idx) => {
        const cardCenter = card.offsetLeft + card.clientWidth / 2;
        const distance = Math.abs(cardCenter - center);
        if (distance < bestDistance) {
          best = idx;
          bestDistance = distance;
        }
      });
      if (cardLoopCycles > 1) {
        activeCardGlobalIndexRef.current = best;
        setActiveIndex(best % inProgressItems.length);
        centerTitlesToGlobalIndex(best, "auto");

        if (loopSettleTimerRef.current !== null) {
          window.clearTimeout(loopSettleTimerRef.current);
        }
        loopSettleTimerRef.current = window.setTimeout(() => {
          if (loopingAdjustRef.current) return;
          const latestCards = Array.from(
            node.querySelectorAll<HTMLElement>('[data-carousel-card="true"]')
          );
          if (!latestCards.length) return;

          const latestCenter = node.scrollLeft + node.clientWidth / 2;
          let latestBest = 0;
          let latestBestDistance = Number.POSITIVE_INFINITY;
          latestCards.forEach((card, idx) => {
            const cardCenter = card.offsetLeft + card.clientWidth / 2;
            const distance = Math.abs(cardCenter - latestCenter);
            if (distance < latestBestDistance) {
              latestBest = idx;
              latestBestDistance = distance;
            }
          });

          const edge = inProgressItems.length;
          if (latestBest < edge || latestBest >= latestCards.length - edge) {
            const middleCycle = Math.floor(cardLoopCycles / 2);
            const realIndex = latestBest % inProgressItems.length;
            const targetIndex = middleCycle * inProgressItems.length + realIndex;
            const target = latestCards[targetIndex];
            if (!target) return;
            loopingAdjustRef.current = true;
            node.scrollTo({ left: target.offsetLeft, behavior: "auto" });
            activeCardGlobalIndexRef.current = targetIndex;
            centerTitlesToGlobalIndex(targetIndex, "auto");
            requestAnimationFrame(() => {
              loopingAdjustRef.current = false;
            });
            return;
          }
          centerTitlesToGlobalIndex(latestBest, "auto");
        }, 90);
        return;
      }
      activeCardGlobalIndexRef.current = best;
      setActiveIndex(best);
      centerTitlesToGlobalIndex(best, "auto");
    };

    handleScroll();
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", handleScroll);
      if (loopSettleTimerRef.current !== null) {
        window.clearTimeout(loopSettleTimerRef.current);
      }
    };
  }, [inProgressItems.length, cardLoopCycles, centerTitlesToGlobalIndex, syncTitlesToCardsPosition]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (initLoopPositionRef.current) return;

    const preferredIndex = initialSeriesId
      ? Math.max(0, inProgressItems.findIndex((series) => series.id === initialSeriesId))
      : 0;
    const cards = Array.from(
      node.querySelectorAll<HTMLElement>('[data-carousel-card="true"]')
    );

    if (cardLoopCycles === 1) {
      const single = cards[preferredIndex];
      if (single) {
        node.scrollTo({ left: single.offsetLeft, behavior: "auto" });
        centerTitlesToGlobalIndex(preferredIndex, "auto");
      }
      initLoopPositionRef.current = true;
      return;
    }

    const middleCycle = Math.floor(cardLoopCycles / 2);
    const targetIndex = middleCycle * inProgressItems.length + preferredIndex;
    const target = cards[targetIndex];
    if (!target) return;
    node.scrollTo({ left: target.offsetLeft, behavior: "auto" });
    activeCardGlobalIndexRef.current = targetIndex;
    centerTitlesToGlobalIndex(targetIndex, "auto");
    initLoopPositionRef.current = true;
  }, [inProgressItems, loopedItems.length, initialSeriesId, cardLoopCycles, centerTitlesToGlobalIndex]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerIdRef.current = event.pointerId;
    dragStartXRef.current = event.clientX;
    dragStartYRef.current = event.clientY;
    swipeUpArmedRef.current = false;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const deltaX = event.clientX - dragStartXRef.current;
    const deltaY = event.clientY - dragStartYRef.current;

    // Reserved for future behavior: upward swipe can expand this footer into a full panel.
    if (!swipeUpArmedRef.current && deltaY < -26 && Math.abs(deltaY) > Math.abs(deltaX)) {
      swipeUpArmedRef.current = true;
    }
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    swipeUpArmedRef.current = false;
  }

  function scrollToIndex(index: number, preferDirection?: "left" | "right") {
    const node = scrollRef.current;
    const cards = node
      ? Array.from(node.querySelectorAll<HTMLElement>('[data-carousel-card="true"]'))
      : [];
    let targetIndex = index;
    if (cardLoopCycles > 1) {
      const n = inProgressItems.length;
      const middleCycle = Math.floor(cardLoopCycles / 2);
      const currentRealIndex = clampedActiveIndex;
      const middleCurrentIndex = middleCycle * n + currentRealIndex;
      const middleCurrentCard = cards[middleCurrentIndex];
      if (node && middleCurrentCard) {
        // Always re-anchor in the middle cycle first.
        loopingAdjustRef.current = true;
        node.scrollTo({ left: middleCurrentCard.offsetLeft, behavior: "auto" });
        activeCardGlobalIndexRef.current = middleCurrentIndex;
        requestAnimationFrame(() => {
          loopingAdjustRef.current = false;
        });
      }

      if (preferDirection === "right") {
        const delta = (index - currentRealIndex + n) % n || n;
        targetIndex = middleCurrentIndex + delta;
      } else if (preferDirection === "left") {
        const delta = (currentRealIndex - index + n) % n || n;
        targetIndex = middleCurrentIndex - delta;
      } else {
        const forwardDelta = (index - currentRealIndex + n) % n;
        const backwardDelta = (currentRealIndex - index + n) % n;
        targetIndex = forwardDelta <= backwardDelta
          ? middleCurrentIndex + forwardDelta
          : middleCurrentIndex - backwardDelta;
      }
    }
    const card = cards[targetIndex];
    if (!node || !card) return;
    node.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    centerTitlesToGlobalIndex(targetIndex, "smooth");
  }

  const clampedActiveIndex = !inProgressItems.length
    ? 0
    : Math.min(activeIndex, inProgressItems.length - 1);

  return (
    <div className="w-full bg-black pb-[calc(var(--tg-content-safe-bottom,0px)+14px)] pt-3 text-white">
      <div
        className="w-full pb-5 pt-0 text-white"
        data-swipe-up-ready="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {/* <div className="px-6">
          <div className="mx-auto h-0.75 w-5 rounded-full bg-white" />
        </div> */}

        {!inProgressItems.length ? (
          <div className="pt-5 text-center text-white/70">Добавьте первый сериал</div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="mt-4 flex w-full snap-x snap-mandatory overflow-x-auto overflow-y-visible pb-1 no-scrollbar touch-pan-x"
            >
              {loopedItems.map((series, idx) => {
                const seasonView = seasonProgressViewBySeriesId[series.id];
                const season = seasonView?.season ?? series.progress?.last?.season ?? null;
                const displayEpisode = seasonView?.episode ?? (series.progress?.last?.episode ?? 0);
                const episodesCount = seasonView?.episodesCount ?? series.episodesCount;
                const middleCycle = Math.floor(cardLoopCycles / 2);
                const centeredGlobalIndex =
                  cardLoopCycles > 1
                    ? middleCycle * inProgressItems.length + clampedActiveIndex
                    : clampedActiveIndex;
                return (
                  <div
                    key={`${series.id}-${idx}`}
                    data-carousel-card="true"
                    className="w-full shrink-0 snap-start overflow-visible px-6"
                  >
                    <div className="relative flex min-h-[52px] items-center gap-x-[12px] overflow-visible pr-[132px]">
                      <div className="h-[60px] w-[40px] shrink-0 rounded-md bg-white/10">
                        {series.posterUrl ? (
                          <img
                            src={series.posterUrl}
                            alt={series.title}
                            className="h-full w-full rounded-sm object-cover"
                            loading={idx === centeredGlobalIndex ? "eager" : "lazy"}
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                      </div>

                      <div
                        role="button"
                        tabIndex={0}
                        className="min-w-0 flex-1 text-left outline-none"
                        onClick={() => {
                          hapticImpact("light");
                          onOpenSeries(series.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          hapticImpact("light");
                          onOpenSeries(series.id);
                        }}
                      >
                        <div className="ty-body-16-semibold pb-1 break-words whitespace-normal">{series.title}</div>
                        <div className="ty-body-14 text-white/60 break-words whitespace-normal">
                          {season ? (
                            <>
                              S<span className="ty-numeric">{season}</span>,{" "}
                            </>
                          ) : null}
                          <span className="ty-numeric">{episodesCount}</span>{" "}
                          {pluralRu(episodesCount, "серия", "серии", "серий")}
                        </div>
                      </div>

                      <div className="absolute right-[64px] top-1/2 w-[58px] -translate-y-1/2 text-center ty-accent-counter ty-numeric text-[#FF3D00] tabular-nums -mr-2">
                        {String(displayEpisode).padStart(2, "0")}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          hapticImpact("light");
                          void Promise.resolve(onAddEpisode(series.id)).catch(() => {});
                        }}
                        className="absolute right-0 top-1/2 inline-flex h-13 w-13 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF3D00]/15 text-[#FF3D00] transition active:scale-95"
                        aria-label={`Добавить серию для ${series.title}`}
                      >
                        <PlusCircleFill className="h-7 w-7" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              ref={titlesScrollRef}
              className="mt-4 flex items-center gap-6 overflow-hidden px-6 no-scrollbar"
            >
              <div aria-hidden="true" className="shrink-0" style={{ width: "calc(50% - 24px)" }} />
              {titleLoopedItems.map((series, idx) => {
                const realIndex = inProgressItems.length > 0 ? idx % inProgressItems.length : 0;
                const rawDistance = Math.abs(realIndex - clampedActiveIndex);
                const distance = Math.min(rawDistance, inProgressItems.length - rawDistance);
                const isActive = distance === 0;
                const isSide = distance === 1;
                const middleCycleIndex = Math.floor(titleLoopCycles / 2);
                const centeredGlobalIndex = middleCycleIndex * inProgressItems.length + clampedActiveIndex;
                const clickDirection =
                  idx > centeredGlobalIndex
                    ? "right"
                    : idx < centeredGlobalIndex
                      ? "left"
                      : undefined;

                return (
                  <button
                    key={`${series.id}-title-${idx}`}
                    ref={(el) => {
                      titleButtonRefs.current[idx] = el;
                    }}
                    type="button"
                    className={[
                      "shrink-0 whitespace-nowrap text-center transition-colors duration-200",
                      isActive
                        ? "text-[14px] font-normal text-white"
                        : isSide
                          ? "text-[12px] font-normal text-white/50"
                          : "text-[12px] font-normal text-white/30",
                    ].join(" ")}
                    onClick={() => {
                      hapticImpact("light");
                      scrollToIndex(realIndex, clickDirection);
                    }}
                    aria-label={`Открыть ${series.title}`}
                  >
                    {series.title}
                  </button>
                );
              })}
              <div aria-hidden="true" className="shrink-0" style={{ width: "calc(50% - 24px)" }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
