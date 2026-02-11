"use client";

import { CheckWavesFill } from "@/icons";
import { cn } from "@/lib/utils";
import useSWR from "swr";

type SeriesCardProps = {
  id: string; // ✅ нужно, чтобы достать постер “как в выдаче”
  title: string;
  subtitle: string;
  rightTop: string;
  rightBottom: string;
  completed?: boolean;
  onClick: () => void;
  className?: string;
  posterUrl?: string; // ✅ optional fallback, если вдруг передаёшь сразу
};

type PosterResponse = { posterUrl: string | null };

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((r) => r.json());

export function SeriesCard({
  id,
  title,
  subtitle,
  rightTop,
  rightBottom,
  completed = false,
  onClick,
  className,
  posterUrl: posterUrlProp,
}: SeriesCardProps) {
  // ✅ берём постер отдельно, как в поисковой выдаче
  const { data } = useSWR<PosterResponse>(
    posterUrlProp ? null : `/api/series/${id}/poster`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const posterUrl = posterUrlProp ?? data?.posterUrl ?? null;
  console.log("CARD", { id, title, posterUrlProp });
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
        {/* LEFT */}
        <div className="row-start-1 row-span-2 col-start-1 grid grid-rows-2 gap-y-1 min-w-0">
          {/* row 1: poster + title */}
          <div className="flex items-center gap-1 min-w-0">
            <div className="h-[1.15em] w-[1.15em] rounded-full overflow-hidden bg-black/10 shrink-0">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              ) : null}
            </div>

            <div className="text-[16px] font-semibold leading-[1.15] min-w-0 truncate">
              {title}
            </div>
          </div>

          {/* row 2: subtitle */}
          <div className="text-[14px] leading-[1.15] text-black/40">
            {subtitle}
          </div>
        </div>

        {/* RIGHT */}
        {completed ? (
          <div className="row-start-1 row-span-2 col-start-2 flex items-center justify-end">
            <CheckWavesFill className="w-6 h-6 text-black" />
          </div>
        ) : (
          <>
            <div className="row-start-1 col-start-2 text-[16px] font-semibold leading-[1.15] text-right">
              {rightTop}
            </div>
            <div className="row-start-2 col-start-2 text-[14px] leading-[1.15] text-black/40 text-right">
              {rightBottom}
            </div>
          </>
        )}
      </div>
    </button>
  );
}
