"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedCounter({
  value,
  duration = 800,
  delay = 0,
}: {
  value: number;
  duration?: number;
  delay?: number;
}) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      startRef.current = null;
      fromRef.current = display;

      const step = (ts: number) => {
        if (!startRef.current) startRef.current = ts;
        const progress = Math.min((ts - startRef.current) / duration, 1);

        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const next = Math.round(
          fromRef.current + (value - fromRef.current) * eased
        );

        setDisplay(next);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        }
      };

      rafRef.current = requestAnimationFrame(step);
    }, delay);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, duration, delay]);

  return <span>{display}</span>;
}
