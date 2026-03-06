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
          "shrink-0 h-12 px-4 rounded-full text-[16px] font-medium whitespace-nowrap inline-flex items-center gap-1",
          "transition active:scale-[0.97]",
          completed
            ? active
              ? "bg-[#00A900] text-white"
              : "bg-[#00A900]/5 text-[#13A600]"
            : active
              ? "bg-black text-white"
              : "bg-black/4 text-black"
        )}
      >
        {completed ? (
          <CheckCircleFill className={cn("h-[21px] w-[21px]", active ? "text-white" : "text-[#13A600]")} />
        ) : null}
        {number} сезон
      </button>
    </div>
  );
}
