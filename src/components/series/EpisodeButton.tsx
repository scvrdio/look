"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/haptics";

type EpisodeButtonProps = {
  number: number;
  watched: boolean;
  onClick: () => void;
};

export function EpisodeButton({ number, watched, onClick }: EpisodeButtonProps) {
  const [pulse, setPulse] = React.useState(false);
  const pulseTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (pulseTimerRef.current) {
        window.clearTimeout(pulseTimerRef.current);
      }
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        hapticSelection();
        // Retrigger local tap animation on every click (including repeated same button clicks).
        setPulse(false);
        requestAnimationFrame(() => {
          setPulse(true);
          if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
          pulseTimerRef.current = window.setTimeout(() => setPulse(false), 220);
        });
        onClick();
      }}
      className={cn(
        "h-16 w-16 rounded-full",
        "flex items-center justify-center",
        "text-[16px] font-medium",
        "transition active:scale-[0.9]",
        pulse && "scale-[0.94] ring-2 ring-black/15",
        watched ? "bg-black text-white" : "bg-black/4 text-black"
      )}
    >
      {number}
    </button>
  );
}
