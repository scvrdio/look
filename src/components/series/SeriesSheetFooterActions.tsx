"use client";

import { PauseFill, PlayFill, PlaylistCheckFill, TrashFill } from "@/icons";

type SeriesSheetFooterActionsProps = {
  paused: boolean;
  onDelete: () => void;
  onPauseToggle: () => void;
  onComplete: () => void;
};

export function SeriesSheetFooterActions({
  paused,
  onDelete,
  onPauseToggle,
  onComplete,
}: SeriesSheetFooterActionsProps) {
  return (
    <div className="mx-auto inline-flex w-fit items-center gap-[32px] rounded-full border-[4px] border-white bg-[#F5F5F5] px-3 py-1">
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex h-[44px] w-[44px] items-center justify-center"
        aria-label="Delete series"
      >
        <TrashFill className="h-6 w-6 text-[#FF0000]" />
      </button>

      <button
        type="button"
        onClick={onPauseToggle}
        className="inline-flex h-[44px] w-[44px] items-center justify-center"
        aria-label={paused ? "Resume" : "Pause"}
      >
        {paused ? (
          <PlayFill className="h-6 w-6 text-black" />
        ) : (
          <PauseFill className="h-6 w-6 text-black" />
        )}
      </button>

      <button
        type="button"
        onClick={onComplete}
        className="inline-flex h-[44px] w-[44px] items-center justify-center"
        aria-label="Mark playlist"
      >
        <PlaylistCheckFill className="h-6 w-6 text-[#00A900]" />
      </button>
    </div>
  );
}
