"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { SeriesFolderPanel } from "@/components/series/SeriesFolderPanel";
import { SeriesSheet } from "@/components/series/SeriesSheet";
import { fetcher } from "@/lib/fetcher";
import type { SeriesRow } from "@/types/bootstrap";

const SERIES_SHEET_CLOSE_MS = 560;

export default function NowWatchingPage() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const closeCleanupTimerRef = useRef<number | null>(null);

  const { data: items, mutate: mutateSeries } = useSWR<SeriesRow[]>("/api/series", fetcher);

  const nowWatchingItems = useMemo(
    () =>
      (items ?? []).filter((series) => {
        const percent = series.progress?.percent ?? 0;
        const last = series.progress?.last;
        return percent < 100 && last != null && !series.paused;
      }),
    [items]
  );

  const activeTitle = useMemo(() => {
    if (!activeSeriesId) return "";
    return (items ?? []).find((series) => series.id === activeSeriesId)?.title ?? "";
  }, [activeSeriesId, items]);

  const activeProgressPercent = useMemo(() => {
    if (!activeSeriesId) return 0;
    return (items ?? []).find((series) => series.id === activeSeriesId)?.progress?.percent ?? 0;
  }, [activeSeriesId, items]);

  const activePaused = useMemo(() => {
    if (!activeSeriesId) return false;
    return Boolean((items ?? []).find((series) => series.id === activeSeriesId)?.paused);
  }, [activeSeriesId, items]);

  const preferredSeasonNumber = useMemo(() => {
    if (!activeSeriesId) return null;
    return (items ?? []).find((series) => series.id === activeSeriesId)?.progress?.last?.season ?? null;
  }, [activeSeriesId, items]);

  const preferredEpisodeNumber = useMemo(() => {
    if (!activeSeriesId) return null;
    return (items ?? []).find((series) => series.id === activeSeriesId)?.progress?.last?.episode ?? null;
  }, [activeSeriesId, items]);

  function openSeriesSheet(seriesId: string) {
    if (closeCleanupTimerRef.current !== null) {
      window.clearTimeout(closeCleanupTimerRef.current);
      closeCleanupTimerRef.current = null;
    }
    setActiveSeriesId(seriesId);
    setSheetOpen(true);
  }

  useEffect(() => {
    return () => {
      if (closeCleanupTimerRef.current !== null) {
        window.clearTimeout(closeCleanupTimerRef.current);
      }
    };
  }, []);

  return (
    <main className="h-dvh overflow-hidden overscroll-none bg-black">
      <div className="mx-auto flex h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-black">
        <div className="min-h-0 flex flex-1 flex-col overflow-y-auto overflow-x-visible overscroll-y-contain no-scrollbar rounded-b-none bg-white px-4 pt-[calc(var(--tg-content-safe-top,0px)+var(--tg-top-offset-base,32px))]">
          <SeriesFolderPanel
            title="Смотрю сейчас"
            items={nowWatchingItems}
            onBack={() => router.push("/")}
            onOpenSeries={openSeriesSheet}
          />
        </div>
      </div>

      <SeriesSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (closeCleanupTimerRef.current !== null) {
            window.clearTimeout(closeCleanupTimerRef.current);
            closeCleanupTimerRef.current = null;
          }

          setSheetOpen(open);
          if (open) return;

          closeCleanupTimerRef.current = window.setTimeout(() => {
            setActiveSeriesId(null);
            closeCleanupTimerRef.current = null;
          }, SERIES_SHEET_CLOSE_MS);
        }}
        seriesId={activeSeriesId}
        title={activeTitle}
        progressPercent={activeProgressPercent}
        paused={activePaused}
        preferredSeasonNumber={preferredSeasonNumber}
        preferredEpisodeNumber={preferredEpisodeNumber}
        onChanged={() => {
          void mutateSeries();
        }}
        onResumedFromPause={() => {
          void mutateSeries();
        }}
        onProgressStarted={() => {
          void mutateSeries();
        }}
      />
    </main>
  );
}
