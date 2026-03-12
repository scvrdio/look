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
        "w-full aspect-square rounded-full",
        "flex items-center justify-center",
        "ty-body-16-medium",
        "transition-none",
        watched ? "bg-black text-white" : "bg-black/4 text-black"
      )}
    >
      <span className="ty-numeric">{number}</span>
    </button>
  );
}
