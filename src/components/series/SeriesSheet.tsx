"use client";

import * as React from "react";
import useSWR from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { SeasonTabs } from "@/components/series/SeasonTabs";
import { EpisodeGrid } from "@/components/series/EpisodeGrid";
import { fetcher } from "@/lib/fetcher";

type SeasonRow = {
  id: string;
  number: number;
  episodesCount: number;
};

type EpisodeRow = {
  id: string;
  number: number;
  watched: boolean;
};

type SeriesSheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seriesId: string | null;
  title: string;
  onChanged?: () => void; // дергаем, чтобы главная обновила прогресс
};

export function SeriesSheet({
  open,
  onOpenChange,
  seriesId,
  title,
  onChanged,
}: SeriesSheetProps) {
  const [activeSeasonId, setActiveSeasonId] = React.useState<string | null>(null);

  // 1) Сезоны (кэшируются SWR)
  const seasonsKey = seriesId ? `/api/series/${seriesId}/seasons` : null;

  const {
    data: seasons = [],
    isLoading: loadingSeasons,
  } = useSWR<SeasonRow[]>(seasonsKey, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // Когда меняется сериал — сбрасываем activeSeasonId, чтобы выбрать первый сезон нового сериала
  React.useEffect(() => {
    setActiveSeasonId(null);
  }, [seriesId]);

  // Выбрать первый сезон по умолчанию, когда сезоны приехали
  React.useEffect(() => {
    if (!activeSeasonId && seasons.length > 0) {
      setActiveSeasonId(seasons[0].id);
    }
  }, [activeSeasonId, seasons]);

  // 2) Эпизоды активного сезона (кэшируются SWR)
  const episodesKey = activeSeasonId ? `/api/seasons/${activeSeasonId}/episodes` : null;

  const {
    data: episodes = [],
    isLoading: loadingEpisodes,
    mutate: mutateEpisodes,
  } = useSWR<EpisodeRow[]>(episodesKey, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // 3) Оптимистичный toggle через mutateEpisodes (без локального setEpisodes)
  async function toggleEpisode(id: string) {
    if (!episodesKey) return;

    // optimistic next state
    const next = episodes.map((e) => (e.id === id ? { ...e, watched: !e.watched } : e));
    await mutateEpisodes(next, false);

    const res = await fetch(`/api/episodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      // откат к серверному состоянию
      await mutateEpisodes();
      return;
    }

    // обновить прогресс на главной
    onChanged?.();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-[24px] border-0 shadow-none h-[65dvh] overflow-hidden"
      >
        <VisuallyHidden>
          <Dialog.Title>{title || "Сериал"}</Dialog.Title>
        </VisuallyHidden>

        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="text-[32px] font-bold tracking-tight leading-[1]">
                {title || ""}
              </div>

              <SheetClose asChild>
                <button
                  type="button"
                  className="h-10 w-10 rounded-full text-black/60 text-[32px] inline-flex items-center justify-center"
                  aria-label="Close"
                >
                  ×
                </button>
              </SheetClose>
            </div>
          </div>

          {/* Body (scroll) */}
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            <div className="flex h-full flex-col">
              {/* Seasons (full-bleed, сверху) */}
              <div className="-mx-5">
                <div className="px-5 overflow-x-auto no-scrollbar">
                  <div className="py-2">
                    <SeasonTabs
                      items={seasons.map((s) => ({ id: s.id, number: s.number }))}
                      activeId={activeSeasonId}
                      onChange={setActiveSeasonId}
                    />
                  </div>
                </div>
              </div>

              {/* Episodes (прилипают к низу) */}
              <div className="mt-auto pt-6">
                {loadingSeasons || loadingEpisodes ? (
                  <div className="text-black/40">Загрузка…</div>
                ) : (
                  <EpisodeGrid items={episodes} onToggle={toggleEpisode} />
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
