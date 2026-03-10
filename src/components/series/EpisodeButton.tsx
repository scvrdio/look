"use client";

import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/haptics";
import ClickSpark from "@/components/ClickSpark";

type EpisodeButtonProps = {
  number: number;
  watched: boolean;
  onClick: () => void;
};

export function EpisodeButton({ number, watched, onClick }: EpisodeButtonProps) {
  const button = (
    <button
      type="button"
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

  return (
    <ClickSpark
      enabled={!watched}
      center
      sparkColor="#FF3D00"
      sparkSize={12}
      sparkRadius={24}
      sparkCount={10}
      duration={300}
    >
      {button}
    </ClickSpark>
  );
}
