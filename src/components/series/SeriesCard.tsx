"use client";

import { CheckCircleFill } from "@/icons";
import { cn } from "@/lib/utils";
import useSWR from "swr";

type SeriesCardProps = {
  id: string; // ✅ нужно, чтобы достать постер “как в выдаче”
  title: string;
  subtitle: string;
  progressPercent?: number;
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
  progressPercent = 0,
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
  const normalizedPercent = Math.min(100, Math.max(0, progressPercent));
  const radius = 8.5;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalizedPercent / 100);
  const seasonEpisodeMatch = rightTop.match(/S\s*(\d+)\s*E\s*(\d+)/i);
  const seasonNumber = seasonEpisodeMatch?.[1]?.padStart(2, "0");
  const episodeNumber = seasonEpisodeMatch?.[2]?.padStart(2, "0");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-3xl bg-black/5 pr-4.5 pl-3 py-3",
        "transition active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20",
        className
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1 items-center">
        <div className="min-w-0 grid grid-rows-2 gap-y-1.5">
          <div className="flex items-center gap-1 min-w-0">
            <div className="h-[21px] w-[21px] rounded-full overflow-hidden bg-black/10 shrink-0 flex items-center justify-center">
              {completed ? (
                <CheckCircleFill className="h-[21px] w-[21px] text-[#13A600]" />
              ) : posterUrl ? (
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

            <div className="ty-body-16-medium min-w-0 truncate">
              {title}
            </div>
          </div>

          <div className="flex items-center gap-[4px] min-w-0">
            <div className="h-[21px] w-[21px] shrink-0 flex items-center justify-center">
              <svg
                viewBox="0 0 21 21"
                width="21"
                height="21"
                aria-hidden="true"
                className="-rotate-90"
              >
                <circle
                  cx="10.5"
                  cy="10.5"
                  r={radius}
                  fill="none"
                  stroke="#E7D8D2"
                  strokeWidth="1.5"
                />
                <circle
                  cx="10.5"
                  cy="10.5"
                  r={radius}
                  fill="none"
                  stroke="#FF4A00"
                  strokeWidth="3"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                />
              </svg>
            </div>
            <span className="ty-meta text-black/60 truncate">{subtitle}</span>
          </div>
        </div>

        <div className="justify-self-end self-center inline-flex h-fit w-fit shrink-0 items-center px-[10px] py-[10px] bg-black/4 rounded-lg">
          {seasonNumber && episodeNumber ? (
            <div className="flex items-baseline gap-1">
              <span className="flex items-baseline gap-[1px]">
                <span className="ty-caption-12-semibold text-black/40">S</span>
                <span className="ty-body-16-medium ty-numeric-card-season-episode leading-[0.9] text-black">{seasonNumber}</span>
              </span>
              <span className="flex items-baseline gap-[1px]">
                <span className="ty-caption-12-semibold text-black/40">E</span>
                <span className="ty-body-16-medium ty-numeric-card-season-episode leading-[0.9] text-black">{episodeNumber}</span>
              </span>
            </div>
          ) : (
            <div className="ty-stat-28 ty-numeric text-black">{rightTop}</div>
          )}
          <span className="sr-only">{rightBottom}</span>
        </div>
      </div>
    </button>
  );
}
