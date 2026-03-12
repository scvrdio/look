"use client";

import { PlaylistPlusFill } from "@/icons";
import { cn } from "@/lib/utils";

export type SeriesSearchActionVariant = "add" | "adding" | "open" | "in-list";

type SeriesSearchActionButtonProps = {
  variant: SeriesSearchActionVariant;
  addLabel?: string;
  addingLabel?: string;
  openLabel?: string;
  inListLabel?: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
};

export function SeriesSearchActionButton({
  variant,
  addLabel = "Сохранить",
  addingLabel = "Сохраняю",
  openLabel = "Открыть",
  inListLabel = "В списке",
  disabled = false,
  onClick,
  className,
}: SeriesSearchActionButtonProps) {
  const isAddLike = variant === "add" || variant === "adding";
  const isLoading = variant === "adding";
  const isInList = variant === "in-list";
  const isOpen = variant === "open";

  const effectiveDisabled = disabled || isLoading || isInList;
  const baseLabel = isOpen ? openLabel : isInList ? inListLabel : addLabel;
  const reserveLabel = isLoading ? addingLabel : baseLabel;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={effectiveDisabled}
      className={cn(
        "relative inline-flex h-8 items-center rounded-[8px] bg-[#F2F2F2] px-3 ty-caption-13-medium transition-[gap,transform] active:scale-[0.99] disabled:opacity-40",
        isAddLike ? (isLoading ? "gap-0" : "gap-2") : "gap-2",
        className
      )}
    >
      {isAddLike ? (
        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-4 items-center overflow-visible transition-[width] duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            isLoading ? "w-0" : "w-4"
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute left-0 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center transition-[opacity,filter] duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              isLoading ? "opacity-0 blur-[6px]" : "opacity-100 blur-0"
            )}
          >
            <PlaylistPlusFill className="h-4 w-4 text-black" />
          </span>
        </span>
      ) : isOpen ? (
        <span aria-hidden className="h-4 w-4 ty-glyph-17 mb-0.5">↗</span>
      ) : null}

      <span className="relative inline-grid items-center">
        <span className="invisible">{reserveLabel}</span>
        <span
          className={cn(
            "pointer-events-none absolute inset-0 transition-[opacity,filter] duration-300 ease-out",
            isLoading ? "opacity-0 blur-[4px]" : "opacity-100 blur-0"
          )}
        >
          {baseLabel}
        </span>
        {isAddLike ? (
          <span
            className={cn(
              "pointer-events-none absolute inset-0 transition-[opacity,filter] duration-300 ease-out",
              isLoading
                ? "animate-pulse [animation-duration:1.2s] opacity-100 blur-0 text-black/55"
                : "opacity-0 blur-[4px]"
            )}
          >
            {addingLabel}
          </span>
        ) : null}
      </span>

      {isLoading ? (
        <span
          aria-hidden
          className="absolute -right-[4px] -top-[4px] inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#F2F2F2]"
        >
          <span className="h-[12px] w-[12px] rounded-full border-[2px] border-[#C7C7C7] border-t-black animate-spin" />
        </span>
      ) : null}
    </button>
  );
}
