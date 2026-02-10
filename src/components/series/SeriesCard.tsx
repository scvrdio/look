"use client";

import { cn } from "@/lib/utils";

type SeriesCardProps = {
  title: string;
  subtitle: string;
  rightTop: string;
  rightBottom: string;
  onClick: () => void;
  className?: string;
};

export function SeriesCard({
  title,
  subtitle,
  rightTop,
  rightBottom,
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
        <div className="text-[16px] font-semibold leading-[1.15] text-right">
          {rightTop}
        </div>

        <div className="text-[14px] leading-[1.15] text-black/40">{subtitle}</div>
        <div className="text-[14px] leading-[1.15] text-black/40 text-right">
          {rightBottom}
        </div>
      </div>

    </button>
  );
}
