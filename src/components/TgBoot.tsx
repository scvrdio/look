"use client";

import { useEffect } from "react";
import { getTelegramWebApp } from "@/types/telegram";

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
    const tg = getTelegramWebApp();
    if (!tg) return;

    const forceFullscreen = () => {
      try {
        tg.expand?.();
        tg.requestFullscreen?.();
        tg.disableVerticalSwipes?.();
      } catch {}
    };

    try {
      tg.ready?.();
      forceFullscreen();
    } catch {}

    const apply = () => {
      // Если Telegram не отдаёт — будет 0, это ок.
      setCssInsets("tg-safe", tg.safeAreaInset);
      setCssInsets("tg-content-safe", tg.contentSafeAreaInset);
      forceFullscreen();
    };

    apply();
    const retries = [120, 300, 700, 1300];
    const timers = retries.map((delay) =>
      window.setTimeout(() => {
        forceFullscreen();
      }, delay)
    );

    // События могут быть или не быть — оборачиваем безопасно
    try {
      tg.onEvent?.("safeAreaChanged", apply);
      tg.onEvent?.("contentSafeAreaChanged", apply);
      tg.onEvent?.("viewportChanged", apply);
    } catch {}

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      try {
        tg.offEvent?.("safeAreaChanged", apply);
        tg.offEvent?.("contentSafeAreaChanged", apply);
        tg.offEvent?.("viewportChanged", apply);
      } catch {}
    };
  }, []);

  return null;
}
