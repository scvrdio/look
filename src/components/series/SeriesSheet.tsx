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
  onChanged?: () => void;
};

export function SeriesSheet({
  open,
  onOpenChange,
  seriesId,
  title,
  onChanged,
}: SeriesSheetProps) {
  const [activeSeasonId, setActiveSeasonId] = React.useState<string | null>(null);
  const [uiEpisodes, setUiEpisodes] = React.useState<EpisodeRow[] | null>(null);

  const prevSeriesIdRef = React.useRef<string | null>(null);

  // 1) seasons
  const seasonsKey = open && seriesId ? `/api/series/${seriesId}/seasons` : null;
  const { data: seasons } = useSWR<SeasonRow[]>(seasonsKey, fetcher, {
    revalidateOnMount: false,
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  // сброс только когда открыли и сериал реально поменялся
  React.useEffect(() => {
    if (!open) return;
    if (prevSeriesIdRef.current === seriesId) return;

    prevSeriesIdRef.current = seriesId;
    setActiveSeasonId(null);
    // UI эпизоды не чистим агрессивно — оставим до прихода новых,
    // но если это новый сериал, лучше сбросить, чтобы не показывать чужие эпизоды
    setUiEpisodes(null);
  }, [open, seriesId]);

  // выбрать первый сезон по умолчанию
  React.useEffect(() => {
    if (!open) return;
    if (activeSeasonId) return;
    if (!seasons || seasons.length === 0) return;

    setActiveSeasonId(seasons[0].id);
  }, [open, activeSeasonId, seasons]);

  // 2) episodes
  const episodesKey =
    open && activeSeasonId ? `/api/seasons/${activeSeasonId}/episodes` : null;

  const { data: episodes, mutate: mutateEpisodes } = useSWR<EpisodeRow[]>(episodesKey, fetcher, {
    revalidateOnMount: false,
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  // снапшот для UI (не прыгает при смене сезона)
  React.useEffect(() => {
    if (!open) return;
    if (!episodesKey) return;
    if (!episodes) return;

    setUiEpisodes(episodes);
  }, [open, episodesKey, episodes]);

  async function toggleEpisode(id: string) {
    if (!open) return;
    if (!episodesKey) return;
    if (!uiEpisodes) return;

    const prev = uiEpisodes;
    const next = prev.map((e) => (e.id === id ? { ...e, watched: !e.watched } : e));

    // optimistic
    setUiEpisodes(next);
    await mutateEpisodes(next, false);

    const res = await fetch(`/api/episodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      setUiEpisodes(prev);
      await mutateEpisodes(prev, false);
      return;
    }

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

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            <div className="flex h-full flex-col">
              {/* Seasons */}
              <div className="-mx-5">
                <div className="px-5 overflow-x-auto no-scrollbar">
                  <div className="py-2">
                    <SeasonTabs
                      items={(seasons ?? []).map((s) => ({ id: s.id, number: s.number }))}
                      activeId={activeSeasonId}
                      onChange={setActiveSeasonId}
                    />
                  </div>
                </div>
              </div>

              {/* Episodes */}
              <div className="mt-auto pt-6">
                <EpisodeGrid items={uiEpisodes ?? []} onToggle={toggleEpisode} />
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
