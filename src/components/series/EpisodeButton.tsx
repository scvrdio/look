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
      onClick={() => {
        hapticSelection();
        onClick();
      }}
      className={cn(
        "h-16 w-16 rounded-full",
        "flex items-center justify-center",
        "text-[16px] font-medium",
        "transition active:scale-[0.9]",
        watched ? "bg-black text-white" : "bg-black/4 text-black"
      )}
    >
      {number}
    </button>
  );
}
