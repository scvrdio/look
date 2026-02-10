"use client";

import { cn } from "@/lib/utils";

export type SeasonTab = { id: string; number: number };

type Props = {
  items: SeasonTab[];
  activeId: string | null;
  onChange: (id: string) => void;
  className?: string;
};

export function SeasonTabs({ items, activeId, onChange, className }: Props) {
  return (
    <div className={cn("flex gap-2", className)}>
      {items.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={cn(
              "shrink-0 h-12 px-5 rounded-full text-[16px] font-medium",
              active ? "bg-black text-white" : "bg-black/4 text-black"
            )}
          >
            {s.number} сезон
          </button>
        );
      })}
    </div>
  );
}
