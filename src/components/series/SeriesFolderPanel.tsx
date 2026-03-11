"use client";

import { useEffect, useState } from "react";

import { XCircleFill } from "@/icons";
import { pluralRu } from "@/lib/plural";
import { hapticImpact } from "@/lib/haptics";
import { SeriesCard } from "@/components/series/SeriesCard";

import type { SeriesRow } from "@/types/bootstrap";

type SeriesFolderPanelProps = {
  title: string;
  items: SeriesRow[];
  onBack: () => void;
  onOpenSeries: (seriesId: string) => void;
};

export function SeriesFolderPanel({ title, items, onBack, onOpenSeries }: SeriesFolderPanelProps) {
  const [headerReady, setHeaderReady] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHeaderReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={[
          "transition-all duration-500 ease-out",
          headerReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-[8px]",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <h1
            className="pl-1 text-[32px] font-black leading-[0.92] text-black"
            style={{ fontVariationSettings: '"wdth" 75', fontStretch: "75%" }}
          >
            {title}
          </h1>
          <button
            type="button"
            onClick={() => {
              hapticImpact("light");
              onBack();
            }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-black transition-transform active:scale-95"
            aria-label="Закрыть папку"
          >
            <XCircleFill className="h-8 w-8" />
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-2 pb-4">
        {items.length === 0 ? (
          <div className="px-1 text-[14px] opacity-60">Пока пусто</div>
        ) : (
          items.map((s, i) => {
            const rightTop = `S${s.progress?.last?.season ?? 1} E${s.progress?.last?.episode ?? 0}`;
            const rightBottom = `${s.progress?.percent ?? 0}%`;
            const completed = (s.progress?.percent ?? 0) === 100;

            return (
              <div
                key={s.id}
                style={{ transitionDelay: `${i * 80}ms` }}
                className={[
                  "transition-all duration-500 ease-out",
                  headerReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-12 blur-[8px]",
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
                    hapticImpact("light");
                    onOpenSeries(s.id);
                  }}
                  completed={completed}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
