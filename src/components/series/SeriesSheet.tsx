"use client";

import * as React from "react";
import useSWR from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { SeasonTabs } from "@/components/series/SeasonTabs";
import { EpisodeGrid } from "@/components/series/EpisodeGrid";
import { fetcher } from "@/lib/fetcher";

import { X, Trash } from "@/icons";
import { hapticImpact } from "@/lib/haptics";
import { useRouter } from "next/navigation";

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

  const router = useRouter();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const deletingRef = React.useRef(false);


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

    if (!res.ok) {
      setUiEpisodes(prev);
      await mutateEpisodes(prev, false);
      return;
    }

    // 4) обновить прогресс на главной
    onChanged?.();
  }

  // "Первичная" загрузка — когда данных реально нет
  const initialLoading =
    (seasonsKey !== null && !seasons) || (episodesKey !== null && !uiEpisodes);


  const displayTitle =
    (title ?? "").trim() || (open && seriesId ? "Загрузка…" : "Сериал");

  // Фоновая валидация — когда данные есть, но идёт обновление
  const backgroundUpdating = Boolean(
    (seasons && validatingSeasons) || (uiEpisodes && validatingEpisodes)
  );

  async function deleteSeries() {
    if (!seriesId) return;
    if (deletingRef.current) return;
    deletingRef.current = true;

    try {
      const res = await fetch(`/api/series/${seriesId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        // не алерт на каждое нажатие, иначе будет ад
        // лучше разово показать внутри модалки/шторки
        return;
      }

      onOpenChange(false);
      onChanged?.();
    } finally {
      deletingRef.current = false;
    }
  }


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-[32px] border-0 shadow-none h-[65dvh] overflow-hidden"
      >
        <VisuallyHidden>
          <Dialog.Title>{displayTitle}</Dialog.Title>
        </VisuallyHidden>

        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="relative px-5 pt-7 pb-4">
            {/* left: close */}
            <SheetClose asChild>
              <button
                type="button"
                onClick={() => hapticImpact("light")}
                className="absolute right-4 top-5 h-10 w-10 rounded-full inline-flex items-center justify-center text-black"
                aria-label="Close"
              >
                <X className="w-6 h-6 text-black" />
              </button>
            </SheetClose>

            {/* right: menu */}
            <button
              type="button"
              onClick={() => {
                if (deleting) return;
                hapticImpact("light");
                setConfirmDeleteOpen(true);
              }}

              className="absolute left-4 top-5 h-10 w-10 rounded-full inline-flex items-center justify-center text-[#FF0000]"
              aria-label="Delete"
            >
              <Trash className="w-6 h-6 text-red-500" />
            </button>

            {/* title */}
            <div className="text-center ty-h1 text-[24px] leading-[1.1] px-12">
              {displayTitle}
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
                    {backgroundUpdating}
                    <EpisodeGrid items={uiEpisodes ?? []} onToggle={toggleEpisode} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        {confirmDeleteOpen && (
          <div className="absolute inset-0 z-50 flex items-end bg-black/40">
            <div className="w-full rounded-t-[24px] bg-white px-5 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)] pt-5">
              <div className="text-[18px] font-semibold">Удалить сериал?</div>
              <div className="mt-1 text-[14px] text-black/60">
                Это действие нельзя отменить.
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="flex-1 h-12 rounded-full bg-black/5 font-medium"
                >
                  Отмена
                </button>

                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    hapticImpact("heavy");
                    await deleteSeries();
                    setConfirmDeleteOpen(false);
                  }}
                  className="flex-1 h-12 rounded-full bg-red-500 text-white font-medium disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}

      </SheetContent>
    </Sheet>
  );
}
