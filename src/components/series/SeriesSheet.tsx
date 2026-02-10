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
  const [uiEpisodes, setUiEpisodes] = React.useState<EpisodeRow[] | null>(null);

  // держим предыдущий сериал, чтобы не сбрасывать состояние в фоне
  const prevSeriesIdRef = React.useRef<string | null>(null);

  // Сезоны
  const seasonsKey = open && seriesId ? `/api/series/${seriesId}/seasons` : null;
  const {
    data: seasons,
    isLoading: loadingSeasons,
    isValidating: validatingSeasons,
  } = useSWR<SeasonRow[]>(seasonsKey, fetcher);

  // При открытии sheet на новый сериал — сбросить выбранный сезон и снапшот эпизодов
  React.useEffect(() => {
    if (!open) return;

    if (prevSeriesIdRef.current !== seriesId) {
      prevSeriesIdRef.current = seriesId;
      setActiveSeasonId(null);
      setUiEpisodes(null);
    }
  }, [open, seriesId]);

  // Выбрать первый сезон по умолчанию (только когда sheet открыт и сезоны приехали)
  React.useEffect(() => {
    if (!open) return;
    if (activeSeasonId) return;
    if (!seasons || seasons.length === 0) return;

    setActiveSeasonId(seasons[0].id);
  }, [open, activeSeasonId, seasons]);

  // Эпизоды активного сезона
  const episodesKey =
    open && activeSeasonId ? `/api/seasons/${activeSeasonId}/episodes` : null;

  const {
    data: episodes,
    isLoading: loadingEpisodes,
    isValidating: validatingEpisodes,
    mutate: mutateEpisodes,
  } = useSWR<EpisodeRow[]>(episodesKey, fetcher);

  // UI-снапшот: обновляем только когда реально пришли данные для текущего ключа
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

    // 1) мгновенно обновляем UI + SWR cache без revalidate
    setUiEpisodes(next);
    await mutateEpisodes(next, false);

    // 2) пишем на сервер
    const res = await fetch(`/api/episodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    // 3) откат при ошибке — без лишнего refetch
    if (!res.ok) {
      setUiEpisodes(prev);
      await mutateEpisodes(prev, false);
      return;
    }

    // 4) обновить прогресс на главной (серии/процент)
    onChanged?.();
  }

  // "Первичная" загрузка — когда данных реально нет
  const initialLoading =
    (seasonsKey !== null && !seasons) || (episodesKey !== null && !uiEpisodes);

  // Фоновая валидация — когда данные есть, но идёт обновление
  const backgroundUpdating = Boolean(
    (seasons && validatingSeasons) || (uiEpisodes && validatingEpisodes)
  );

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
                      items={(seasons ?? []).map((s) => ({ id: s.id, number: s.number }))}
                      activeId={activeSeasonId}
                      onChange={(id) => {
                        setActiveSeasonId(id);
                        // при смене сезона не очищаем грид визуально — uiEpisodes останется старым,
                        // а обновится, когда придут новые episodes
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Episodes (прилипают к низу) */}
              <div className="mt-auto pt-6">
                {initialLoading ? (
                  <div className="text-black/40">Загрузка…</div>
                ) : (
                  <>
                    {backgroundUpdating && (
                      <div className="text-black/30 text-sm mb-2">Обновление…</div>
                    )}
                    <EpisodeGrid items={uiEpisodes ?? []} onToggle={toggleEpisode} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
