"use client";

import * as React from "react";
import useSWR from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import Lottie from "lottie-react";

import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { SeasonTabs } from "@/components/series/SeasonTabs";
import { EpisodeGrid } from "@/components/series/EpisodeGrid";
import { fetcher } from "@/lib/fetcher";
import loadingAnimation from "../../../public/lottie.json";

import { X, Trash } from "@/icons";
import { hapticImpact } from "@/lib/haptics";

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

const SHEET_CLOSE_MS = 500;
const EPISODE_STAGGER_MS = 40;

type SeriesSheetProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seriesId: string | null;
  title: string;
  preferredSeasonNumber?: number | null;
  preferredEpisodeNumber?: number | null;
  onChanged?: () => void;
};

export function SeriesSheet({
  open,
  onOpenChange,
  seriesId,
  title,
  preferredSeasonNumber,
  preferredEpisodeNumber,
  onChanged,
}: SeriesSheetProps) {
  const [activeSeasonId, setActiveSeasonId] = React.useState<string | null>(null);
  const [uiEpisodes, setUiEpisodes] = React.useState<EpisodeRow[] | null>(null);

  // анимации
  const [episodesReady, setEpisodesReady] = React.useState(false);
  const [seasonsReady, setSeasonsReady] = React.useState(false);
  const [episodesClosing, setEpisodesClosing] = React.useState(false);
  const [showLoadingLottie, setShowLoadingLottie] = React.useState(false);

  const prevSeriesIdRef = React.useRef<string | null>(null);
  const prevEpisodesKeyRef = React.useRef<string | null>(null);
  const uiEpisodesCountRef = React.useRef(0);
  const prevOpenRef = React.useRef(open);
  const closeResetTimerRef = React.useRef<number | null>(null);
  const loadingLottieTimerRef = React.useRef<number | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const deletingRef = React.useRef(false);

  // Сезоны
  const seasonsKey = open && seriesId ? `/api/series/${seriesId}/seasons` : null;
  const { data: seasons, isValidating: validatingSeasons } = useSWR<SeasonRow[]>(seasonsKey, fetcher);

  // При открытии sheet на новый сериал — сбросить выбранный сезон и снапшот эпизодов
  React.useEffect(() => {
    if (!open) return;

    if (prevSeriesIdRef.current !== seriesId) {
      prevSeriesIdRef.current = seriesId;
      prevEpisodesKeyRef.current = null;
      setActiveSeasonId(null);
      setUiEpisodes(null);

      setEpisodesReady(false);
      setSeasonsReady(false);
    }
  }, [open, seriesId]);

  // Run exit animation on close, then reset local state after sheet animation ends.
  React.useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;

    if (open) {
      setEpisodesClosing(false);
      if (closeResetTimerRef.current) {
        window.clearTimeout(closeResetTimerRef.current);
        closeResetTimerRef.current = null;
      }
      return;
    }

    setEpisodesReady(false);
    setSeasonsReady(false);
    setEpisodesClosing(true);

    const itemsCount = uiEpisodesCountRef.current;
    const reverseExitTotalMs = Math.max(itemsCount - 1, 0) * EPISODE_STAGGER_MS;
    const resetAfterMs = SHEET_CLOSE_MS + reverseExitTotalMs;

    if (closeResetTimerRef.current) {
      window.clearTimeout(closeResetTimerRef.current);
    }
    closeResetTimerRef.current = window.setTimeout(() => {
      prevEpisodesKeyRef.current = null;
      setActiveSeasonId(null);
      setUiEpisodes(null);
      setEpisodesClosing(false);
      closeResetTimerRef.current = null;
    }, resetAfterMs);
  }, [open]);

  React.useEffect(() => {
    return () => {
      if (closeResetTimerRef.current) {
        window.clearTimeout(closeResetTimerRef.current);
      }
      if (loadingLottieTimerRef.current) {
        window.clearTimeout(loadingLottieTimerRef.current);
      }
    };
  }, []);

  // Выбрать сезон пользователя (по прогрессу), иначе первый
  React.useEffect(() => {
    if (!open) return;
    if (activeSeasonId) return;
    if (!seasons || seasons.length === 0) return;

    const preferred =
      preferredSeasonNumber != null
        ? seasons.find((s) => s.number === preferredSeasonNumber)
        : null;

    let targetSeasonId = preferred?.id ?? seasons[0].id;

    // If user completed preferred season, jump to the next one.
    if (
      preferred &&
      preferredEpisodeNumber != null &&
      preferredEpisodeNumber >= preferred.episodesCount
    ) {
      const nextSeason = seasons.find((s) => s.number === preferred.number + 1);
      if (nextSeason) targetSeasonId = nextSeason.id;
    }

    setActiveSeasonId(targetSeasonId);
  }, [open, activeSeasonId, seasons, preferredSeasonNumber, preferredEpisodeNumber]);

  // Запуск анимации табов, когда сезоны приехали
  React.useEffect(() => {
    if (!open) return;
    if (!seasonsKey) return;
    if (!seasons) return;

    setSeasonsReady(false);
    requestAnimationFrame(() => setSeasonsReady(true));
  }, [open, seasonsKey, seasons]);

  // Эпизоды активного сезона
  const episodesKey = open && activeSeasonId ? `/api/seasons/${activeSeasonId}/episodes` : null;

  const {
    data: episodes,
    isValidating: validatingEpisodes,
    mutate: mutateEpisodes,
  } = useSWR<EpisodeRow[]>(episodesKey, fetcher);

  // UI-снапшот + запуск анимации серий
  React.useEffect(() => {
    if (!open) return;
    if (!episodesKey) return;
    if (!episodes) return;
    if (validatingEpisodes) return;

    setUiEpisodes(episodes);
    if (prevEpisodesKeyRef.current === episodesKey) {
      return;
    }

    prevEpisodesKeyRef.current = episodesKey;
    setEpisodesReady(false);
    requestAnimationFrame(() => setEpisodesReady(true));
  }, [open, episodesKey, episodes, validatingEpisodes]);

  React.useEffect(() => {
    uiEpisodesCountRef.current = uiEpisodes?.length ?? 0;
  }, [uiEpisodes]);

  async function toggleEpisode(id: string) {
    if (!open) return;
    if (!episodesKey) return;
    if (!uiEpisodes) return;

    const prev = uiEpisodes;
    const next = prev.map((e) => (e.id === id ? { ...e, watched: !e.watched } : e));

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

  const initialLoading =
    (seasonsKey !== null && !seasons) || (episodesKey !== null && !uiEpisodes);

  React.useEffect(() => {
    if (!open || !initialLoading) {
      setShowLoadingLottie(false);
      if (loadingLottieTimerRef.current) {
        window.clearTimeout(loadingLottieTimerRef.current);
        loadingLottieTimerRef.current = null;
      }
      return;
    }

    setShowLoadingLottie(false);
    if (loadingLottieTimerRef.current) {
      window.clearTimeout(loadingLottieTimerRef.current);
    }
    loadingLottieTimerRef.current = window.setTimeout(() => {
      setShowLoadingLottie(true);
      loadingLottieTimerRef.current = null;
    }, 1000);
  }, [open, initialLoading]);

  const displayTitle = (title ?? "").trim() || (open && seriesId ? "Загрузка…" : "Сериал");

  const backgroundUpdating = Boolean(
    (seasons && validatingSeasons) || (uiEpisodes && validatingEpisodes)
  );

  async function deleteSeries() {
    if (!seriesId) return;
    if (deletingRef.current) return;
    deletingRef.current = true;

    try {
      const res = await fetch(`/api/series/${seriesId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) return;

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

            <button
              type="button"
              onClick={() => {
                if (deletingRef.current) return;
                hapticImpact("light");
                setConfirmDeleteOpen(true);
              }}
              className="absolute left-4 top-5 h-10 w-10 rounded-full inline-flex items-center justify-center text-[#FF0000]"
              aria-label="Delete"
            >
              <Trash className="w-6 h-6 text-red-500" />
            </button>

            <div className="text-center ty-h1 text-[24px] leading-[1.1] px-12">{displayTitle}</div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            <div className="flex h-full flex-col">

              {/* Episodes */}
              <div className="pt-4">
                {initialLoading ? (
                  <div className="h-[220px] flex items-center justify-center">
                    {showLoadingLottie ? (
                      <div className="w-[180px]">
                        <Lottie animationData={loadingAnimation} loop autoplay />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {backgroundUpdating ? null : null}
                    <EpisodeGrid
                      items={uiEpisodes ?? []}
                      onToggle={toggleEpisode}
                      ready={episodesReady}
                      closing={episodesClosing}
                    />
                  </>
                )}
              </div>

              {/* Seasons */}
              <div className="mt-auto -mx-5">
                <div className="px-5 overflow-x-auto no-scrollbar">
                  <div className="py-2">
                    <SeasonTabs
                      items={(seasons ?? []).map((s) => ({ id: s.id, number: s.number }))}
                      activeId={activeSeasonId}
                      ready={seasonsReady}
                      onChange={(id) => {
                        if (id === activeSeasonId) return;
                        setEpisodesReady(false);
                        setUiEpisodes(null);
                        setActiveSeasonId(id);
                      }}
                    />
                  </div>
                </div>
              </div>

              
            </div>
          </div>
        </div>

        {confirmDeleteOpen && (
          <div className="absolute inset-0 z-50 flex items-end bg-black/40">
            <div className="w-full rounded-t-[24px] bg-white px-5 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)] pt-5">
              <div className="text-[18px] font-semibold">Удалить сериал?</div>
              <div className="mt-1 text-[14px] text-black/60">Это действие нельзя отменить.</div>

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
                  disabled={deletingRef.current}
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
