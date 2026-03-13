"use client";

import { useEffect, useRef, useState } from "react";

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

const FOOTER_ANIMATION_MS = 820;
const FOOTER_COLLAPSED_HEIGHT = 214;

export function HomeFooter({
  hidden,
  initialSeriesId,
  items,
  onAddEpisode,
  onOpenSeries,
  onRoundedChange,
}: HomeFooterProps) {
  const footerContentRef = useRef<HTMLDivElement | null>(null);
  const enterRaf1Ref = useRef<number | null>(null);
  const enterRaf2Ref = useRef<number | null>(null);
  const mountTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);
  const radiusTimerRef = useRef<number | null>(null);
  const [footerMounted, setFooterMounted] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);

  const footerItems = items.filter((series) => {
    const percent = series.progress?.percent ?? 0;
    const last = series.progress?.last;
    return percent < 100 && last != null && !series.paused;
  });
  const hasFooterItems = footerItems.length > 0;
  const footerShown = hasFooterItems && !hidden;
  const targetHeight = Math.max(footerHeight, FOOTER_COLLAPSED_HEIGHT);

  useEffect(() => {
    const node = footerContentRef.current;
    if (!node) return;

    const updateHeight = () => {
      setFooterHeight(node.scrollHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [footerMounted, footerItems.length]);

  useEffect(() => {
    if (enterRaf1Ref.current !== null) {
      window.cancelAnimationFrame(enterRaf1Ref.current);
      enterRaf1Ref.current = null;
    }
    if (enterRaf2Ref.current !== null) {
      window.cancelAnimationFrame(enterRaf2Ref.current);
      enterRaf2Ref.current = null;
    }
    if (mountTimerRef.current !== null) {
      window.clearTimeout(mountTimerRef.current);
      mountTimerRef.current = null;
    }
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }

    if (footerShown) {
      mountTimerRef.current = window.setTimeout(() => {
        setFooterMounted(true);
        mountTimerRef.current = null;

        enterRaf1Ref.current = window.requestAnimationFrame(() => {
          enterRaf2Ref.current = window.requestAnimationFrame(() => {
            setFooterVisible(true);
            enterRaf1Ref.current = null;
            enterRaf2Ref.current = null;
          });
        });
      }, 0);

      return () => {
        if (mountTimerRef.current !== null) {
          window.clearTimeout(mountTimerRef.current);
          mountTimerRef.current = null;
        }
        if (enterRaf1Ref.current !== null) {
          window.cancelAnimationFrame(enterRaf1Ref.current);
          enterRaf1Ref.current = null;
        }
        if (enterRaf2Ref.current !== null) {
          window.cancelAnimationFrame(enterRaf2Ref.current);
          enterRaf2Ref.current = null;
        }
      };
    }

    mountTimerRef.current = window.setTimeout(() => {
      setFooterVisible(false);
      mountTimerRef.current = null;
    }, 0);

    if (!hasFooterItems) {
      unmountTimerRef.current = window.setTimeout(() => {
        setFooterMounted(false);
        unmountTimerRef.current = null;
      }, 0);
      return () => {
        if (unmountTimerRef.current !== null) {
          window.clearTimeout(unmountTimerRef.current);
          unmountTimerRef.current = null;
        }
      };
    }

    unmountTimerRef.current = window.setTimeout(() => {
      setFooterMounted(false);
      unmountTimerRef.current = null;
    }, FOOTER_ANIMATION_MS);

    return () => {
      if (unmountTimerRef.current !== null) {
        window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
    };
  }, [footerShown, hasFooterItems]);

  useEffect(() => {
    if (radiusTimerRef.current !== null) {
      window.clearTimeout(radiusTimerRef.current);
      radiusTimerRef.current = null;
    }

    if (footerVisible) {
      onRoundedChange(true);
      return;
    }

    if (!hasFooterItems) {
      onRoundedChange(false);
      return;
    }

    radiusTimerRef.current = window.setTimeout(() => {
      onRoundedChange(false);
      radiusTimerRef.current = null;
    }, FOOTER_ANIMATION_MS - 80);
  }, [footerVisible, hasFooterItems, onRoundedChange]);

  useEffect(() => {
    return () => {
      if (enterRaf1Ref.current !== null) {
        window.cancelAnimationFrame(enterRaf1Ref.current);
      }
      if (enterRaf2Ref.current !== null) {
        window.cancelAnimationFrame(enterRaf2Ref.current);
      }
      if (mountTimerRef.current !== null) {
        window.clearTimeout(mountTimerRef.current);
      }
      if (unmountTimerRef.current !== null) {
        window.clearTimeout(unmountTimerRef.current);
      }
      if (radiusTimerRef.current !== null) {
        window.clearTimeout(radiusTimerRef.current);
      }
    };
  }, []);

  if (!hasFooterItems || (!footerShown && !footerMounted)) {
    return null;
  }

  return (
    <div
      className={[
        "w-full shrink-0 overflow-hidden transition-[max-height,opacity,transform,filter] duration-[820ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[max-height,opacity,transform,filter]",
        footerVisible
          ? "pointer-events-auto opacity-100 translate-y-0 blur-0"
          : "pointer-events-none opacity-0 translate-y-6 blur-[14px]",
      ].join(" ")}
      style={{ maxHeight: footerVisible ? `${targetHeight}px` : "0px" }}
    >
      <div ref={footerContentRef}>
        <SeriesFooterCarousel
          items={footerItems}
          initialSeriesId={initialSeriesId}
          onOpenSeries={(seriesId) => onOpenSeries(seriesId, null)}
          onAddEpisode={(seriesId) => onAddEpisode(seriesId)}
        />
      </div>
    </div>
  );
}


