"use client";

import { cn } from "@/lib/utils";
import { CircleCheck } from "lucide-react";


type SeriesCardProps = {
  title: string;
  subtitle: string;
  rightTop: string;
  rightBottom: string;
  completed?: boolean;
  onClick: () => void;
  className?: string;
};

export function SeriesCard({
  title,
  subtitle,
  rightTop,
  rightBottom,
  completed = false,
  onClick,
  className,
}: SeriesCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-3xl bg-black/3 px-4 py-3",
        "transition active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20",
        className
      )}
    >
      <div className="grid grid-cols-[1fr_auto] grid-rows-2 items-start gap-x-4 gap-y-1">
        <div className="text-[16px] font-semibold leading-[1.15]">{title}</div>

        <div className="text-right">
          {!completed && (
            <div className="text-[16px] font-semibold leading-[1.15] text-right">
              {rightTop}
            </div>
          )}
        </div>

        <div className="text-[14px] leading-[1.15] text-black/40">{subtitle}</div>

        {completed && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <CircleCheck size={22} strokeWidth={3} className="text-black" />
          </div>
        )}
      </div>

    </button>
  );
}
