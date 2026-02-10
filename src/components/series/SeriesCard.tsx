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
      <div className="grid grid-cols-[1fr_auto] grid-rows-2 gap-x-4 gap-y-1">
        {/* row 1 col 1 */}
        <div className="row-start-1 col-start-1 text-[16px] font-semibold leading-[1.15]">
          {title}
        </div>

        {/* row 2 col 1 */}
        <div className="row-start-2 col-start-1 text-[14px] leading-[1.15] text-black/40">
          {subtitle}
        </div>

        {/* right side */}
        {completed ? (
          <div className="row-start-1 row-span-2 col-start-2 flex items-center justify-end">
            <CircleCheck size={22} strokeWidth={2} className="text-black" />
          </div>
        ) : (
          <>
            {/* row 1 col 2 */}
            <div className="row-start-1 col-start-2 text-[16px] font-semibold leading-[1.15] text-right">
              {rightTop}
            </div>

            {/* row 2 col 2 */}
            <div className="row-start-2 col-start-2 text-[14px] leading-[1.15] text-black/40 text-right">
              {rightBottom}
            </div>
          </>
        )}
      </div>
    </button>
  );
}
