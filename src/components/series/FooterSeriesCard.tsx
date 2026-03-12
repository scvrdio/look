"use client";

import { PlusCircleFill } from "@/icons";

type FooterSeriesCardProps = {
  title: string;
  subtitle: string;
  episodeNumber: number;
  posterUrl: string | null | undefined;
  onOpen: () => void;
  onAdd: () => void;
  eagerPoster?: boolean;
};

export function FooterSeriesCard({
  title,
  subtitle,
  episodeNumber,
  posterUrl,
  onOpen,
  onAdd,
  eagerPoster = false,
}: FooterSeriesCardProps) {
  return (
    <div className="relative flex min-h-[52px] items-center gap-x-[12px] overflow-visible pr-[132px]">
      <div className="h-[60px] w-[40px] shrink-0 rounded-md bg-white/10">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="h-full w-full rounded-sm object-cover"
            loading={eagerPoster ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </div>

      <div
        role="button"
        tabIndex={0}
        className="min-w-0 flex-1 text-left outline-none"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpen();
        }}
      >
        <div className="ty-body-16-semibold pb-1 break-words whitespace-normal">{title}</div>
        <div className="ty-body-14 text-white/60 break-words whitespace-normal">{subtitle}</div>
      </div>

      <div className="absolute right-[64px] top-1/2 w-[58px] -translate-y-1/2 text-center ty-accent-counter ty-numeric text-[#FF3D00] tabular-nums -mr-2">
        {String(episodeNumber).padStart(2, "0")}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="absolute right-0 top-1/2 inline-flex h-13 w-13 -translate-y-1/2 items-center justify-center rounded-full bg-[#FF3D00]/15 text-[#FF3D00] transition active:scale-95"
        aria-label={`Добавить серию для ${title}`}
      >
        <PlusCircleFill className="h-7 w-7" />
      </button>
    </div>
  );
}
