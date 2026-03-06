"use client";

import * as React from "react";
import { EpisodeButton } from "./EpisodeButton";


type EpisodeRow = {
  id: string;
  number: number;
  watched: boolean;
};

type Props = {
  items: EpisodeRow[];
  onToggle: (id: string) => void;
  ready: boolean;
  closing?: boolean;
};

export function EpisodeGrid({ items, onToggle, ready, closing = false }: Props) {
  return (
    <div className="grid grid-cols-5 justify-between gap-2">
      {items.map((e, i) => {
        // On close, play exit animation in reverse order: last episode first.
        // On open, keep the original order: first episode first.
        const delayIndex = !ready && closing ? items.length - 1 - i : i;
        return (
        <div
          key={e.id}
          style={{ transitionDelay: `${delayIndex * 40}ms` }}
          className={[
            "transition-all duration-500 ease-out",
            ready ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-2 blur-[6px]",
          ].join(" ")}
        >
          <EpisodeButton
            key={e.id}
            number={e.number}
            watched={e.watched}
            onClick={() => onToggle(e.id)}
          />
        </div>
        );
      })}
    </div>
  );
}
