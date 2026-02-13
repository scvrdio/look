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
};

export function EpisodeGrid({ items, onToggle, ready }: Props) {
  return (
    <div className="grid grid-cols-5 justify-between gap-2">
      {items.map((e, i) => (
        <div
          key={e.id}
          style={{ transitionDelay: `${i * 40}ms` }}
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
      ))}
    </div>
  );
}
