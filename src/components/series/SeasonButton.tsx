"use client";

import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/haptics";

type SeasonButtonProps = {
  number: number;
  active: boolean;
  onClick: () => void;

  // для анимации
  index: number;
  ready: boolean;
};

export function SeasonButton({
  number,
  active,
  onClick,
  index,
  ready,
}: SeasonButtonProps) {
  return (
    <div
      style={{ transitionDelay: `${index * 60}ms` }}
      className={cn(
        "shrink-0 transition-all duration-500 ease-out",
        ready ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-3 blur-[6px]"
      )}
    >
      <button
        type="button"
        onClick={() => {
          hapticSelection();
          onClick();
        }}
        className={cn(
          "shrink-0 h-12 px-5 rounded-full text-[16px] font-medium",
          "transition active:scale-[0.97]",
          active ? "bg-black text-white" : "bg-black/4 text-black"
        )}
      >
        {number} сезон
      </button>
    </div>
  );
}
