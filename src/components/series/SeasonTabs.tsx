"use client";

import * as React from "react";
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

function findHorizontalScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowX = style.overflowX;
    const canScroll =
      (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
      current.scrollWidth > current.clientWidth;

    if (canScroll) return current;
    current = current.parentElement;
  }

  return null;
}

export function SeasonTabs({ items, activeId, onChange, className, ready }: Props) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = React.useRef(false);

  React.useEffect(() => {
    if (!activeId) return;
    if (!rootRef.current) return;

    const activeEl = rootRef.current.querySelector<HTMLElement>(`[data-season-id="${activeId}"]`);
    if (!activeEl) return;

    const scroller = findHorizontalScrollParent(rootRef.current);
    if (!scroller) return;

    const activeRect = activeEl.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const rawTargetLeft =
      activeRect.left -
      scrollerRect.left +
      scroller.scrollLeft -
      (scroller.clientWidth - activeRect.width) / 2;

    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const targetLeft = Math.max(0, Math.min(rawTargetLeft, maxScrollLeft));
    const behavior = didInitialScrollRef.current ? "smooth" : "auto";

    scroller.scrollTo({ left: targetLeft, behavior });
    didInitialScrollRef.current = true;
  }, [activeId, items]);

  return (
    <div ref={rootRef} className={cn("flex gap-2", className)}>
      <div aria-hidden className="shrink-0" />
      {items.map((s, i) => (
        <div key={s.id} data-season-id={s.id} className="shrink-0">
          <SeasonButton
            number={s.number}
            active={s.id === activeId}
            index={i}
            ready={ready}
            onClick={() => onChange(s.id)}
          />
        </div>
      ))}
      <div aria-hidden className="w-3 shrink-0" />
    </div>
  );
}
