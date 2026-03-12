"use client";

import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/haptics";

type SeasonButtonProps = {
  number: number;
  active: boolean;
  completed?: boolean;
  onClick: () => void;

  // для анимации
  index: number;
  ready: boolean;
};

export function SeasonButton({
  number,
  active,
  completed = false,
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
          "shrink-0 h-12 px-5 rounded-full ty-body-16-medium whitespace-nowrap inline-flex items-center gap-2",
          "transition active:scale-[0.97]",
          completed
            ? "bg-[#DFE6DF] text-[#13A600]"
            : active
              ? "bg-black text-white"
              : "bg-black/4 text-black"
        )}
      >
        {completed ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#13A600] text-white ty-glyph-15">
            ✓
          </span>
        ) : null}
        <span className="ty-numeric">{number}</span> сезон
      </button>
    </div>
  );
}
