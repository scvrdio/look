"use client";

import { cn } from "@/lib/utils";
import { SeasonButton } from "./SeasonButton";

export type SeasonTab = { id: string; number: number };

type Props = {
  items: SeasonTab[];
  activeId: string | null;
  onChange: (id: string) => void;
  className?: string;

  // для анимации
  ready: boolean;
};

export function SeasonTabs({ items, activeId, onChange, className, ready }: Props) {
  return (
    <div className={cn("flex gap-2 pr-4", className)}>
      {items.map((s, i) => (
        <SeasonButton
          key={s.id}
          number={s.number}
          active={s.id === activeId}
          index={i}
          ready={ready}
          onClick={() => onChange(s.id)}
        />
      ))}
    </div>
  );
}
