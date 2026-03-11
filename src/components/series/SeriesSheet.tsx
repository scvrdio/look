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
import { getTelegramWebApp } from "@/types/telegram";
import loadingAnimation from "../../../public/lottie.json";

import { X, TrashFill, PauseFill, PlayFill, PlaylistCheckFill } from "@/icons";
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
  posterUrl?: string | null;
  paused?: boolean;
  preferredSeasonNumber?: number | null;
  preferredEpisodeNumber?: number | null;
  onChanged?: () => void;
};

export function SeriesSheet({
  open,
  onOpenChange,
  seriesId,
  title,
  posterUrl,
  paused = false,
  preferredSeasonNumber,
  preferredEpisodeNumber,
  onChanged,
}: SeriesSheetProps) {
  const SWIPE_CLOSE_DISTANCE_PX = 36;
  const SWIPE_CLOSE_VELOCITY_PX_PER_MS = 0.25;
  const EPISODE_FLUSH_DEBOUNCE_MS = 160;
  const CHANGED_NOTIFY_DEBOUNCE_MS = 320;

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
  const desiredWatchedByEpisodeIdRef = React.useRef<Map<string, boolean>>(new Map());
  const flushTimerByEpisodeIdRef = React.useRef<Map<string, number>>(new Map());
  const changedNotifyTimerRef = React.useRef<number | null>(null);

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

    // Keep inner content static on close to avoid heavy per-item animations.
    // The sheet container animation is enough and is much smoother on mobile WebView.
    setEpisodesClosing(false);

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
    const flushTimers = flushTimerByEpisodeIdRef.current;
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
      if (changedNotifyTimerRef.current) {
        window.clearTimeout(changedNotifyTimerRef.current);
      }
      for (const timer of flushTimers.values()) {
        window.clearTimeout(timer);
      }
      flushTimers.clear();
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
    content.style.transition = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
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

  function closeSheetBySwipe() {
    const content = dragContentRef.current;
    if (content) {
      content.style.transition = "";
      content.style.transform = "";
    }
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
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'button,a,input,textarea,select,label,[role="button"],[data-no-sheet-drag="true"]'
      )
    ) {
      return;
    }

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
      closeSheetBySwipe();
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

  function setEpisodeWatchedLocal(seasonId: string, episodeId: string, watched: boolean) {
    setUiEpisodes((current) => {
      if (!current) return current;
      const next = current.map((e) => (e.id === episodeId ? { ...e, watched } : e));
      setCompletedBySeasonId((prevCompleted) => ({
        ...prevCompleted,
        [seasonId]: next.length > 0 && next.every((e) => e.watched),
      }));
      return next;
    });

    void mutateEpisodes((current) => {
      if (!Array.isArray(current)) return current;
      return current.map((e) => (e.id === episodeId ? { ...e, watched } : e));
    }, false);
  }

  function scheduleChangedNotify() {
    if (!onChanged) return;
    if (changedNotifyTimerRef.current) {
      window.clearTimeout(changedNotifyTimerRef.current);
    }
    changedNotifyTimerRef.current = window.setTimeout(() => {
      changedNotifyTimerRef.current = null;
      onChanged();
    }, CHANGED_NOTIFY_DEBOUNCE_MS);
  }

  function scheduleEpisodeFlush(seasonId: string, episodeId: string) {
    const prevTimer = flushTimerByEpisodeIdRef.current.get(episodeId);
    if (prevTimer) {
      window.clearTimeout(prevTimer);
    }
    const timer = window.setTimeout(() => {
      flushTimerByEpisodeIdRef.current.delete(episodeId);
      void flushEpisodeDesiredState(seasonId, episodeId);
    }, EPISODE_FLUSH_DEBOUNCE_MS);
    flushTimerByEpisodeIdRef.current.set(episodeId, timer);
  }

  function toggleEpisodeLocal(seasonId: string, episodeId: string): boolean | null {
    let nextWatched: boolean | null = null;

    setUiEpisodes((current) => {
      if (!current) return current;
      const next = current.map((e) => {
        if (e.id !== episodeId) return e;
        nextWatched = !e.watched;
        return { ...e, watched: nextWatched };
      });
      setCompletedBySeasonId((prevCompleted) => ({
        ...prevCompleted,
        [seasonId]: next.length > 0 && next.every((e) => e.watched),
      }));
      return next;
    });

    void mutateEpisodes((current) => {
      if (!Array.isArray(current)) return current;
      return current.map((e) => (e.id === episodeId ? { ...e, watched: !e.watched } : e));
    }, false);

    return nextWatched;
  }

  async function flushEpisodeDesiredState(seasonId: string, episodeId: string) {
    if (pendingEpisodeIdsRef.current.has(episodeId)) return;
    pendingEpisodeIdsRef.current.add(episodeId);

    try {
      while (true) {
        const desired = desiredWatchedByEpisodeIdRef.current.get(episodeId);
        if (typeof desired !== "boolean") break;
        const requestedWatched = desired;

        const res = await fetch(`/api/episodes/${episodeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ watched: requestedWatched }),
        });

        if (!res.ok) {
          throw new Error(`PATCH /api/episodes/${episodeId} failed with ${res.status}`);
        }

        const payload = (await res.json()) as ToggleEpisodeResponse;
        const latestDesired = desiredWatchedByEpisodeIdRef.current.get(episodeId);
        const serverWatched =
          typeof payload?.watched === "boolean" ? payload.watched : requestedWatched;

        // If user changed the target state while this request was in-flight,
        // ignore this stale response to avoid visual "self-repeat" toggles.
        if (latestDesired !== requestedWatched) {
          continue;
        }

        setEpisodeWatchedLocal(seasonId, episodeId, serverWatched);
        if (latestDesired === serverWatched) {
          desiredWatchedByEpisodeIdRef.current.delete(episodeId);
          break;
        }
      }

      scheduleChangedNotify();
    } catch {
      desiredWatchedByEpisodeIdRef.current.delete(episodeId);
      const fresh = await mutateEpisodes();
      if (Array.isArray(fresh)) {
        setUiEpisodes(fresh);
        setCompletedBySeasonId((prevCompleted) => ({
          ...prevCompleted,
          [seasonId]: fresh.length > 0 && fresh.every((e) => e.watched),
        }));
      }
    } finally {
      pendingEpisodeIdsRef.current.delete(episodeId);
    }
  }

  async function toggleEpisode(id: string) {
    if (!open) return;
    if (!episodesKey) return;
    if (!uiEpisodes) return;
    if (!activeSeasonId) return;

    const episode = uiEpisodes.find((e) => e.id === id);
    if (!episode) return;

    const seasonIdAtToggle = activeSeasonId;

    const nextWatched = toggleEpisodeLocal(seasonIdAtToggle, id);
    if (typeof nextWatched !== "boolean") return;

    desiredWatchedByEpisodeIdRef.current.set(id, nextWatched);
    scheduleEpisodeFlush(seasonIdAtToggle, id);
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

  async function setSeriesPaused(nextPaused: boolean) {
    if (!seriesId) return false;

    const res = await fetch(`/api/series/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paused: nextPaused }),
    });

    if (!res.ok) return false;
    onOpenChange(false);
    onChanged?.();
    return true;
  }

  async function completeSeries() {
    if (!seriesId) return false;

    const res = await fetch(`/api/series/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ completed: true }),
    });

    if (!res.ok) return false;
    onOpenChange(false);
    onChanged?.();
    return true;
  }

  async function confirmDeleteSeriesSystem() {
    const tg = getTelegramWebApp();
    if (tg?.showPopup) {
      return await new Promise<boolean>((resolve) => {
        tg.showPopup?.(
          {
            title: "Удалить сериал",
            message: "Это действие нельзя отменить",
            buttons: [
              { id: "cancel", type: "cancel", text: "Отмена" },
              { id: "delete", type: "destructive", text: "Удалить" },
            ],
          },
          (buttonId) => resolve(buttonId === "delete")
        );
      });
    }

    return window.confirm("Удалить сериал\n\nЭто действие нельзя отменить");
  }

  async function confirmPauseSeriesSystem() {
    const tg = getTelegramWebApp();
    if (tg?.showPopup) {
      return await new Promise<boolean>((resolve) => {
        tg.showPopup?.(
          {
            title: "Поставить на паузу",
            message: "Сериал будет перемещён в архив",
            buttons: [
              { id: "cancel", type: "cancel", text: "Отмена" },
              { id: "pause", type: "ok", text: "Пауза" },
            ],
          },
          (buttonId) => resolve(buttonId === "pause")
        );
      });
    }

    return window.confirm("Поставить на паузу?\n\nСериал будет перемещён в архив");
  }

  async function confirmCompleteSeriesSystem() {
    const tg = getTelegramWebApp();
    if (tg?.showPopup) {
      return await new Promise<boolean>((resolve) => {
        tg.showPopup?.(
          {
            title: "Завершить сериал",
            message: "Отметим сериал как завершённый",
            buttons: [
              { id: "cancel", type: "cancel", text: "Отмена" },
              { id: "complete", type: "ok", text: "Завершить" },
            ],
          },
          (buttonId) => resolve(buttonId === "complete")
        );
      });
    }

    return window.confirm("Завершить сериал?\n\nОтметим сериал как завершённый");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-[32px] border-0 shadow-none h-[65dvh] overflow-visible"
      >
        <VisuallyHidden>
          <Dialog.Title>{displayTitle}</Dialog.Title>
        </VisuallyHidden>

        <div className="flex h-full flex-col">
          {/* Header */}
          <div
            className="relative z-40 px-5 pb-0 pt-6"
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerEnd}
            onPointerCancel={onSheetPointerEnd}
          >
            <div className="grid grid-cols-[28px_1fr_28px] items-center gap-3">
              <div className="h-7 w-7 overflow-hidden rounded-full bg-black/10">
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={displayTitle}
                    className="h-full w-full object-cover"
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
              </div>

              <div className="min-w-0 text-center ty-h1 text-[24px] leading-[1.1] truncate">
                {displayTitle}
              </div>

              <SheetClose asChild>
                <button
                  type="button"
                  onClick={() => hapticImpact("light")}
                  className="inline-flex h-7 w-7 items-center justify-center text-black"
                  aria-label="Close"
                >
                  <X className="h-7 w-7 text-black" />
                </button>
              </SheetClose>
            </div>
          </div>

          {/* Seasons */}
          <div className="relative z-40 mt-8 overflow-visible">
            <div className="overflow-x-auto no-scrollbar pr-5 pl-3 py-1">
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

          {/* Episodes */}
          <div
            ref={scrollAreaRef}
            className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 pb-6 pt-6"
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerEnd}
            onPointerCancel={onSheetPointerEnd}
          >
            {initialLoading ? (
              <div className="flex h-[220px] items-center justify-center">
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

          {/* Footer actions */}
          <div className="relative z-40 px-5 pb-[calc(var(--tg-content-safe-bottom,0px)+24px)] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,#fff_50%,#fff_100%)]">
            <div className="flex items-center justify-center gap-[32px]">
              <button
                type="button"
                onClick={async () => {
                  if (deletingRef.current) return;
                  hapticImpact("light");
                  const confirmed = await confirmDeleteSeriesSystem();
                  if (!confirmed) return;
                  hapticImpact("heavy");
                  await deleteSeries();
                }}
                className="inline-flex h-[44px] w-[44px] items-center justify-center"
                aria-label="Delete series"
              >
                <TrashFill className="h-7 w-7 text-[#FF0000]" />
              </button>

              <button
                type="button"
                onClick={async () => {
                  hapticImpact("light");
                  if (paused) {
                    const resumed = await setSeriesPaused(false);
                    if (!resumed) return;
                    hapticImpact("medium");
                    return;
                  }
                  const confirmed = await confirmPauseSeriesSystem();
                  if (!confirmed) return;
                  const movedToPause = await setSeriesPaused(true);
                  if (!movedToPause) return;
                  hapticImpact("medium");
                }}
                className="inline-flex h-[60px] w-[60px] items-center justify-center"
                aria-label={paused ? "Resume" : "Pause"}
              >
                {paused ? (
                  <PlayFill className="h-7 w-7 text-[#000000]" />
                ) : (
                  <PauseFill className="h-7 w-7 text-[#000000]" />
                )}
              </button>

              <button
                type="button"
                onClick={async () => {
                  hapticImpact("light");
                  const confirmed = await confirmCompleteSeriesSystem();
                  if (!confirmed) return;
                  const completed = await completeSeries();
                  if (!completed) return;
                  hapticImpact("medium");
                }}
                className="inline-flex h-[60px] w-[60px] items-center justify-center"
                aria-label="Mark playlist"
              >
                <PlaylistCheckFill className="h-7 w-7 text-[#00A900]" />
              </button>
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
