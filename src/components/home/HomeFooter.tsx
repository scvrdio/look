"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { SeriesFooterCarousel } from "@/components/series/SeriesFooterCarousel";

import type { SeriesRow } from "@/types/bootstrap";

type HomeFooterProps = {
  hidden: boolean;
  initialSeriesId: string | null;
  items: SeriesRow[];
  onAddEpisode: (seriesId: string) => Promise<void>;
  onOpenSeries: (seriesId: string, source: null) => void;
  onRoundedChange: (rounded: boolean) => void;
};

const FOOTER_SPRING = {
  type: "spring" as const,
  stiffness: 75,
  damping: 15,
  mass: 1,
};

export function HomeFooter({
  hidden,
  initialSeriesId,
  items,
  onAddEpisode,
  onOpenSeries,
  onRoundedChange,
}: HomeFooterProps) {
  const footerItems = items.filter((series) => {
    const percent = series.progress?.percent ?? 0;
    const last = series.progress?.last;
    return percent < 100 && last != null && !series.paused;
  });
  const footerShown = footerItems.length > 0 && !hidden;

  useEffect(() => {
    if (!footerShown) return;
    onRoundedChange(true);
  }, [footerShown, onRoundedChange]);

  return (
    <AnimatePresence initial={false} onExitComplete={() => onRoundedChange(false)}>
      {footerShown ? (
        <motion.div
          key="home-footer"
          className="w-full shrink-0 overflow-hidden will-change-[height,opacity,transform,filter]"
          initial={{ height: 0, opacity: 0, y: 24, filter: "blur(14px)" }}
          animate={{
            height: "auto",
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
          }}
          exit={{
            height: 0,
            opacity: 0,
            y: 16,
            filter: "blur(10px)",
          }}
          transition={{
            height: FOOTER_SPRING,
            y: FOOTER_SPRING,
            opacity: { duration: 0.3, ease: "easeOut" },
            filter: { duration: 0.34, ease: "easeOut" },
          }}
        >
          <div>
            <SeriesFooterCarousel
              items={footerItems}
              initialSeriesId={initialSeriesId}
              onOpenSeries={(seriesId) => onOpenSeries(seriesId, null)}
              onAddEpisode={(seriesId) => onAddEpisode(seriesId)}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
