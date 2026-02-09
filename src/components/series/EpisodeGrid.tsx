"use client";

import { EpisodeButton } from "./EpisodeButton";

type Episode = {
  id: string;
  number: number;
  watched: boolean;
};

type EpisodeGridProps = {
  items: Episode[];
  onToggle: (id: string) => void;
};

export function EpisodeGrid({ items, onToggle }: EpisodeGridProps) {
    return (
      <div className="grid grid-cols-5 justify-between gap-2">
        {items.map((e) => (
          <EpisodeButton
            key={e.id}
            number={e.number}
            watched={e.watched}
            onClick={() => onToggle(e.id)}
          />
        ))}
      </div>
    );
  }
