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
  completed?: boolean;
};

type EpisodeRow = {
  id: string;
  number: number;
  watched: boolean;
};

type ToggleEpisodeResponse = {
  id: string;
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
  const SWIPE_CLOSE_DISTANCE_PX = 36;
  const SWIPE_CLOSE_VELOCITY_PX_PER_MS = 0.25;
  const SWIPE_CLOSE_ANIMATION_MS = 280;

  const [activeSeasonId, setActiveSeasonId] = React.useState<string | null>(null);
  const [uiEpisodes, setUiEpisodes] = React.useState<EpisodeRow[] | null>(null);

  // анимации
  const [episodesReady, setEpisodesReady] = React.useState(false);
  const [seasonsReady, setSeasonsReady] = React.useState(false);
  const [episodesClosing, setEpisodesClosing] = React.useState(false);
  const [showLoadingLottie, setShowLoadingLottie] = React.useState(false);
  const [completedBySeasonId, setCompletedBySeasonId] = React.useState<Record<string, boolean>>({});

  const prevSeriesIdRef = React.useRef<string | null>(null);
  const prevEpisodesKeyRef = React.useRef<string | null>(null);
  const uiEpisodesCountRef = React.useRef(0);
  const prevOpenRef = React.useRef(open);
  const closeResetTimerRef = React.useRef<number | null>(null);
  const loadingLottieTimerRef = React.useRef<number | null>(null);
  const dragResetTimerRef = React.useRef<number | null>(null);
  const draggingPointerIdRef = React.useRef<number | null>(null);
  const dragPhaseRef = React.useRef<"idle" | "pending" | "active">("idle");
  const dragStartYRef = React.useRef(0);
  const dragStartXRef = React.useRef(0);
  const dragStartedAtRef = React.useRef(0);
  const dragOffsetYRef = React.useRef(0);
  const dragContentRef = React.useRef<HTMLElement | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const deletingRef = React.useRef(false);
  const pendingEpisodeIdsRef = React.useRef<Set<string>>(new Set());

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
      setCompletedBySeasonId({});

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
      setCompletedBySeasonId({});
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
      if (dragResetTimerRef.current) {
        window.clearTimeout(dragResetTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const content = dragContentRef.current;
    if (!content) return;
    content.style.transform = "";
    content.style.transition = "";
  }, [open]);

  function resolveSheetContent(element: HTMLElement): HTMLElement | null {
    return element.closest('[data-slot="sheet-content"]') as HTMLElement | null;
  }

  function setDragTransform(offsetY: number) {
    const content = dragContentRef.current;
    if (!content) return;
    content.style.transition = "none";
    content.style.transform = `translateY(${offsetY}px)`;
  }

  function animateDragReset() {
    const content = dragContentRef.current;
    if (!content) return;
    content.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
    content.style.transform = "translateY(0px)";
    if (dragResetTimerRef.current) {
      window.clearTimeout(dragResetTimerRef.current);
    }
    dragResetTimerRef.current = window.setTimeout(() => {
      const node = dragContentRef.current;
      if (!node) return;
      // Keep transform at zero to avoid a visual jump after release.
      node.style.transition = "";
      dragResetTimerRef.current = null;
    }, 240);
  }

  function animateSwipeClose(offsetY: number) {
    const content = dragContentRef.current;
    if (!content) {
      onOpenChange(false);
      return;
    }

    const target = Math.max(content.offsetHeight, offsetY + 120);
    content.style.transition = `transform ${SWIPE_CLOSE_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    content.style.transform = `translateY(${target}px)`;
    onOpenChange(false);
  }

  function clearDragState() {
    draggingPointerIdRef.current = null;
    dragPhaseRef.current = "idle";
    dragStartYRef.current = 0;
    dragStartXRef.current = 0;
    dragStartedAtRef.current = 0;
    dragOffsetYRef.current = 0;
  }

  function onSheetPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const content = resolveSheetContent(event.currentTarget);
    if (!content) return;

    dragContentRef.current = content;
    draggingPointerIdRef.current = event.pointerId;
    dragPhaseRef.current = "pending";
    dragStartYRef.current = event.clientY;
    dragStartXRef.current = event.clientX;
    dragStartedAtRef.current = performance.now();
    dragOffsetYRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onSheetPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (draggingPointerIdRef.current !== event.pointerId) return;
    const deltaY = event.clientY - dragStartYRef.current;
    const deltaX = event.clientX - dragStartXRef.current;

    if (dragPhaseRef.current === "pending") {
      if (Math.abs(deltaY) < 6 && Math.abs(deltaX) < 6) return;

      const isVertical = Math.abs(deltaY) > Math.abs(deltaX);
      const atTop = (scrollAreaRef.current?.scrollTop ?? 0) <= 0;
      if (!isVertical || deltaY <= 0 || !atTop) {
        clearDragState();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        return;
      }

      dragPhaseRef.current = "active";
    }

    if (dragPhaseRef.current !== "active") return;

    const rawOffset = Math.max(0, deltaY);
    if (rawOffset <= 0) {
      dragOffsetYRef.current = 0;
      setDragTransform(0);
      return;
    }

    dragOffsetYRef.current = rawOffset;
    setDragTransform(rawOffset);
    event.preventDefault();
  }

  function onSheetPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (draggingPointerIdRef.current !== event.pointerId) return;

    const wasActive = dragPhaseRef.current === "active";
    const offset = Math.max(0, dragOffsetYRef.current);
    const elapsedMs = Math.max(1, performance.now() - dragStartedAtRef.current);
    const velocity = offset / elapsedMs;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    clearDragState();

    if (!wasActive) return;

    if (offset >= SWIPE_CLOSE_DISTANCE_PX || velocity >= SWIPE_CLOSE_VELOCITY_PX_PER_MS) {
      animateSwipeClose(offset);
      return;
    }

    animateDragReset();
  }

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

    setUiEpisodes(episodes);
    if (activeSeasonId) {
      setCompletedBySeasonId((prev) => ({
        ...prev,
        [activeSeasonId]: episodes.length > 0 && episodes.every((e) => e.watched),
      }));
    }
    if (prevEpisodesKeyRef.current === episodesKey) {
      setEpisodesReady(true);
      return;
    }

    prevEpisodesKeyRef.current = episodesKey;
    setEpisodesReady(false);
    requestAnimationFrame(() => setEpisodesReady(true));
  }, [open, episodesKey, episodes, activeSeasonId]);

  React.useEffect(() => {
    uiEpisodesCountRef.current = uiEpisodes?.length ?? 0;
  }, [uiEpisodes]);

  async function toggleEpisode(id: string) {
    if (!open) return;
    if (!episodesKey) return;
    if (!uiEpisodes) return;
    if (pendingEpisodeIdsRef.current.has(id)) return;

    const prev = uiEpisodes;
    const next = prev.map((e) => (e.id === id ? { ...e, watched: !e.watched } : e));
    const nextTarget = next.find((e) => e.id === id)?.watched;
    if (typeof nextTarget !== "boolean") return;

    pendingEpisodeIdsRef.current.add(id);

    setUiEpisodes(next);
    if (activeSeasonId) {
      setCompletedBySeasonId((prevCompleted) => ({
        ...prevCompleted,
        [activeSeasonId]: next.length > 0 && next.every((e) => e.watched),
      }));
    }
    await mutateEpisodes(next, false);

    try {
      const res = await fetch(`/api/episodes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ watched: nextTarget }),
      });

      if (!res.ok) {
        setUiEpisodes(prev);
        if (activeSeasonId) {
          setCompletedBySeasonId((prevCompleted) => ({
            ...prevCompleted,
            [activeSeasonId]: prev.length > 0 && prev.every((e) => e.watched),
          }));
        }
        await mutateEpisodes(prev, false);
        return;
      }

      const payload = (await res.json()) as ToggleEpisodeResponse;
      if (typeof payload?.watched === "boolean") {
        const synced = next.map((e) => (e.id === id ? { ...e, watched: payload.watched } : e));
        setUiEpisodes(synced);
        if (activeSeasonId) {
          setCompletedBySeasonId((prevCompleted) => ({
            ...prevCompleted,
            [activeSeasonId]: synced.length > 0 && synced.every((e) => e.watched),
          }));
        }
        await mutateEpisodes(synced, false);
      }

      onChanged?.();
    } finally {
      pendingEpisodeIdsRef.current.delete(id);
    }
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
          <div
            className="relative px-5 pt-7 pb-4"
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerEnd}
            onPointerCancel={onSheetPointerEnd}
          >
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
          <div
            ref={scrollAreaRef}
            className="flex-1 overflow-y-auto px-5 pb-6"
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerEnd}
            onPointerCancel={onSheetPointerEnd}
          >
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
                      items={(seasons ?? []).map((s) => ({
                        id: s.id,
                        number: s.number,
                        completed: completedBySeasonId[s.id] ?? Boolean(s.completed),
                      }))}
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
