"use client";

import { useEffect } from "react";

type Insets = { top: number; bottom: number; left: number; right: number };

function setCssInsets(name: string, insets?: Partial<Insets> | null) {
  const top = Math.max(0, Math.floor(insets?.top ?? 0));
  const bottom = Math.max(0, Math.floor(insets?.bottom ?? 0));
  const left = Math.max(0, Math.floor(insets?.left ?? 0));
  const right = Math.max(0, Math.floor(insets?.right ?? 0));

  const root = document.documentElement;
  root.style.setProperty(`--${name}-top`, `${top}px`);
  root.style.setProperty(`--${name}-bottom`, `${bottom}px`);
  root.style.setProperty(`--${name}-left`, `${left}px`);
  root.style.setProperty(`--${name}-right`, `${right}px`);
}

export function TgBoot() {
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg) return;

    try {
      tg.ready?.();
      tg.expand?.();
    } catch {}

    const apply = () => {
      // Если Telegram не отдаёт — будет 0, это ок.
      setCssInsets("tg-safe", tg.safeAreaInset);
      setCssInsets("tg-content-safe", tg.contentSafeAreaInset);
    };

    apply();

    // События могут быть или не быть — оборачиваем безопасно
    try {
      tg.onEvent?.("safeAreaChanged", apply);
      tg.onEvent?.("contentSafeAreaChanged", apply);
      tg.onEvent?.("viewportChanged", apply);
    } catch {}

    return () => {
      try {
        tg.offEvent?.("safeAreaChanged", apply);
        tg.offEvent?.("contentSafeAreaChanged", apply);
        tg.offEvent?.("viewportChanged", apply);
      } catch {}
    };
  }, []);

  return null;
}
