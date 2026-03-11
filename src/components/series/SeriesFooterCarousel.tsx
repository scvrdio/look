"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { PlusCircleFill } from "@/icons";
import { fetcher } from "@/lib/fetcher";
import { pluralRu } from "@/lib/plural";
import { hapticImpact } from "@/lib/haptics";

import type { SeriesRow } from "@/types/bootstrap";

type SeriesFooterCarouselProps = {
  items: SeriesRow[];
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
  onOpenSeries,
  onAddEpisode,
}: SeriesFooterCarouselProps) {
  type SeasonRow = { id: string; number: number; episodesCount: number };
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { cache, mutate: mutateGlobal } = useSWRConfig();
  const pointerIdRef = useRef<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const swipeUpArmedRef = useRef(false);
  const loopingAdjustRef = useRef(false);
  const initLoopPositionRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [seasonProgressViewBySeriesId, setSeasonProgressViewBySeriesId] = useState<
    Record<string, SeasonProgressView>
  >({});

  const inProgressItems = useMemo(
    () => items.filter((s) => (s.progress?.percent ?? 0) < 100),
    [items]
  );
  const loopedItems = useMemo(() => {
    if (inProgressItems.length <= 1) return inProgressItems;
    const first = inProgressItems[0];
    const last = inProgressItems[inProgressItems.length - 1];
    return [last, ...inProgressItems, first];
  }, [inProgressItems]);

  useEffect(() => {
    initLoopPositionRef.current = false;
  }, [inProgressItems.length]);

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
      if (inProgressItems.length > 1) {
        if (best === 0) {
          const target = cards[inProgressItems.length];
          if (target) {
            loopingAdjustRef.current = true;
            node.scrollTo({ left: target.offsetLeft, behavior: "auto" });
            setActiveIndex(inProgressItems.length - 1);
            requestAnimationFrame(() => {
              loopingAdjustRef.current = false;
            });
          }
          return;
        }
        if (best === cards.length - 1) {
          const target = cards[1];
          if (target) {
            loopingAdjustRef.current = true;
            node.scrollTo({ left: target.offsetLeft, behavior: "auto" });
            setActiveIndex(0);
            requestAnimationFrame(() => {
              loopingAdjustRef.current = false;
            });
          }
          return;
        }
        setActiveIndex(best - 1);
        return;
      }
      setActiveIndex(best);
    };

    handleScroll();
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => node.removeEventListener("scroll", handleScroll);
  }, [inProgressItems.length]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (inProgressItems.length <= 1) {
      initLoopPositionRef.current = false;
      return;
    }
    if (initLoopPositionRef.current) return;

    const cards = Array.from(
      node.querySelectorAll<HTMLElement>('[data-carousel-card="true"]')
    );
    const firstRealCard = cards[1];
    if (!firstRealCard) return;

    node.scrollTo({ left: firstRealCard.offsetLeft, behavior: "auto" });
    initLoopPositionRef.current = true;
  }, [inProgressItems.length, loopedItems.length]);

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

  function scrollToIndex(index: number) {
    const node = scrollRef.current;
    const cards = node
      ? Array.from(node.querySelectorAll<HTMLElement>('[data-carousel-card="true"]'))
      : [];
    const targetIndex = inProgressItems.length > 1 ? index + 1 : index;
    const card = cards[targetIndex];
    if (!node || !card) return;
    node.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
  }

  const clampedActiveIndex = useMemo(() => {
    if (!inProgressItems.length) return 0;
    return Math.min(activeIndex, inProgressItems.length - 1);
  }, [activeIndex, inProgressItems.length]);

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
                            loading={idx === clampedActiveIndex ? "eager" : "lazy"}
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
                        <div className="text-[16px] leading-[1.2] pb-1 break-words font-semibold whitespace-normal">{series.title}</div>
                        <div className="text-[14px] leading-[1.2] text-white/60 break-words whitespace-normal">
                          {season ? `S${season}, ` : ""}
                          {episodesCount}{" "}
                          {pluralRu(episodesCount, "серия", "серии", "серий")}
                        </div>
                      </div>

                      <div
                        className="absolute right-[64px] top-1/2 w-[58px] -translate-y-1/2 text-center text-[48px] font-black text-[#FF3D00] leading-[0.8] tabular-nums"
                        style={{ fontVariationSettings: '"wdth" 75', fontStretch: "75%" }}
                      >
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

            {inProgressItems.length > 1 ? (
              <div className="mt-3 flex touch-none items-center justify-center gap-4">
                {inProgressItems.map((series, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={[
                      "h-4 w-4 overflow-hidden rounded-full transition-opacity",
                      idx === clampedActiveIndex ? "opacity-100" : "opacity-30",
                    ].join(" ")}
                    onClick={() => scrollToIndex(idx)}
                    aria-label={`Слайд ${idx + 1}`}
                  >
                    {series.posterUrl ? (
                      <img
                        src={series.posterUrl}
                        alt={series.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="block h-full w-full bg-white/30" />
                    )}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
