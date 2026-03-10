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
  const [activeIndex, setActiveIndex] = useState(0);
  const [addingBySeriesId, setAddingBySeriesId] = useState<Record<string, boolean>>({});
  const [seasonEpisodesBySeriesId, setSeasonEpisodesBySeriesId] = useState<
    Record<string, number>
  >({});

  const inProgressItems = useMemo(
    () => items.filter((s) => (s.progress?.percent ?? 0) < 100),
    [items]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSeasonEpisodeCounts() {
      const nextMap: Record<string, number> = {};

      for (const series of inProgressItems) {
        const seasonNumber = series.progress?.last?.season;
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

        const currentSeason = (seasons ?? []).find((s) => s.number === seasonNumber);
        if (currentSeason) {
          nextMap[series.id] = currentSeason.episodesCount;
        }
      }

      if (!cancelled) {
        setSeasonEpisodesBySeriesId(nextMap);
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
      setActiveIndex(best);
    };

    handleScroll();
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => node.removeEventListener("scroll", handleScroll);
  }, [inProgressItems.length]);

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
    const card = cards[index];
    if (!node || !card) return;
    node.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
  }

  const clampedActiveIndex = useMemo(() => {
    if (!inProgressItems.length) return 0;
    return Math.min(activeIndex, inProgressItems.length - 1);
  }, [activeIndex, inProgressItems.length]);

  return (
    <div className="bg-black pb-[calc(var(--tg-content-safe-bottom,0px)+14px)] pt-3 text-white">
      <div
        className="pb-5 pt-0 text-white"
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
              className="mt-4 flex snap-x snap-mandatory overflow-x-auto overflow-y-visible pb-1 no-scrollbar touch-pan-x"
            >
              {inProgressItems.map((series, idx) => {
                const season = series.progress?.last?.season ?? null;
                const episodesCount =
                  (season ? seasonEpisodesBySeriesId[series.id] : undefined) ?? series.episodesCount;
                return (
                  <div
                    key={series.id}
                    data-carousel-card="true"
                    className="w-full shrink-0 snap-start overflow-visible px-6"
                  >
                    <div className="relative flex min-h-[52px] items-center gap-x-[12px] overflow-visible pr-[132px]">
                      <div className="h-[52px] w-[34px] shrink-0 rounded-md bg-white/10">
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
                        <div className="text-[16px] leading-[0.95] pb-1.5 break-words font-semibold whitespace-normal">{series.title}</div>
                        <div className="text-[14px] leading-[1.2] text-white/60 break-words whitespace-normal">
                          {season ? `S${season}, ` : ""}
                          {episodesCount}{" "}
                          {pluralRu(episodesCount, "серия", "серии", "серий")}
                        </div>
                      </div>

                      <div
                        className="absolute right-[64px] top-1/2 w-[58px] -translate-y-1/2 text-center text-[48px] font-black leading-[0.8] tabular-nums"
                        style={{ fontVariationSettings: '"wdth" 75', fontStretch: "75%" }}
                      >
                        {String(series.progress?.last?.episode ?? 0).padStart(2, "0")}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (addingBySeriesId[series.id]) return;
                          hapticImpact("light");
                          setAddingBySeriesId((prev) => ({ ...prev, [series.id]: true }));
                          Promise.resolve(onAddEpisode(series.id))
                            .catch(() => {})
                            .finally(() => {
                              setAddingBySeriesId((prev) => ({ ...prev, [series.id]: false }));
                            });
                        }}
                        disabled={Boolean(addingBySeriesId[series.id])}
                        className="absolute right-0 top-1/2 inline-flex h-13 w-13 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                        aria-label={`Добавить серию для ${series.title}`}
                      >
                        <PlusCircleFill className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {inProgressItems.length > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                {inProgressItems.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={[
                      "h-1.5 rounded-full transition-all",
                      idx === clampedActiveIndex ? "w-1.5 bg-white" : "w-1.5 bg-white/15",
                    ].join(" ")}
                    onClick={() => scrollToIndex(idx)}
                    aria-label={`Слайд ${idx + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
