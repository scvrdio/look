"use client";

import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/haptics";

type EpisodeButtonProps = {
  number: number;
  watched: boolean;
  onClick: () => void;
};

export function EpisodeButton({ number, watched, onClick }: EpisodeButtonProps) {
  return (
    <button
      type="button"
      data-sheet-drag-start="true"
      onClick={() => {
        hapticSelection();
        onClick();
      }}
      className={cn(
        "w-full aspect-square rounded-full",
        "flex items-center justify-center",
        "text-[16px] font-medium",
        "transition-none",
        watched ? "bg-black text-white" : "bg-black/4 text-black"
      )}
    >
      {number}
    </button>
  );
}
