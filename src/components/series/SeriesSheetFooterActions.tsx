"use client";

import { PauseFill, PlayFill, PlaylistCheckFill, TrashFill } from "@/icons";
import { KinopoiskButton } from "./KinopoiskButton";
import { SheetActionBar } from "./SheetActionBar";

type SeriesSheetFooterActionsProps = {
  paused: boolean;
  onDelete: () => void;
  onPauseToggle: () => void;
  onComplete: () => void;
  seriesId: string | null;
  title: string;
  open: boolean;
};

export function SeriesSheetFooterActions({
  paused,
  onDelete,
  onPauseToggle,
  onComplete,
  seriesId,
  title,
  open,
}: SeriesSheetFooterActionsProps) {
  return (
    <SheetActionBar>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex h-[44px] w-[44px] items-center justify-center"
        aria-label="Delete series"
      >
        <TrashFill className="h-7 w-7 text-[#FF0000]" />
      </button>

      <button
        type="button"
        onClick={onPauseToggle}
        className="inline-flex h-[44px] w-[44px] items-center justify-center"
        aria-label={paused ? "Resume" : "Pause"}
      >
        {paused ? (
          <PlayFill className="h-7 w-7 text-black" />
        ) : (
          <PauseFill className="h-7 w-7 text-black" />
        )}
      </button>

      <button
        type="button"
        onClick={onComplete}
        className="inline-flex h-[44px] w-[44px] items-center justify-center"
        aria-label="Mark playlist"
      >
        <PlaylistCheckFill className="h-7 w-7 text-[#00A900]" />
      </button>
      {seriesId ? <KinopoiskButton seriesId={seriesId} title={title} active={open} /> : null}
    </SheetActionBar>
  );
}
