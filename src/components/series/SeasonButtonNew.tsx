"use client";

import { CheckCircleFill } from "@/icons";
import { hapticSelection } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type SeasonButtonNewProps = {
  number: number;
  active: boolean;
  completed?: boolean;
  onClick: () => void;
  index: number;
  ready: boolean;
};

export function SeasonButtonNew({
  number,
  active,
  completed = false,
  onClick,
  index,
  ready,
}: SeasonButtonNewProps) {
  return (
    <div
      style={{ transitionDelay: `${index * 60}ms` }}
      className={cn(
        "shrink-0 transition-opacity duration-300 ease-out",
        ready ? "opacity-100" : "opacity-0"
      )}
    >
      <button
        type="button"
        onClick={() => {
          hapticSelection();
          onClick();
        }}
        className={cn(
          "shrink-0 h-12 px-4 rounded-full text-[16px] font-medium whitespace-nowrap inline-flex items-center gap-1",
          "transition-colors active:scale-[0.97]",
          completed
            ? active
              ? "bg-[#00A900] text-white"
              : "bg-[#00A900]/10 text-[#13A600]"
            : active
              ? "bg-black text-white"
              : "bg-black/4 text-black"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-[21px] items-center overflow-visible transition-[width] duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            completed ? "w-[21px]" : "w-0"
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute left-0 top-1/2 inline-flex h-[21px] w-[21px] -translate-y-1/2 items-center justify-center transition-[opacity,filter] duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              completed
                ? "opacity-100 blur-0"
                : "opacity-0 blur-[8px]"
            )}
          >
            <CheckCircleFill
              className={cn("h-[21px] w-[21px] shrink-0", active ? "text-white" : "text-[#13A600]")}
            />
          </span>
        </span>
        {number} сезон
      </button>
    </div>
  );
}
