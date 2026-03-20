"use client";

import { useEffect } from "react";
import { getTelegramWebApp } from "@/types/telegram";

type Insets = { top: number; bottom: number; left: number; right: number };

function isVersionAtLeast(version: string | undefined, minVersion: string) {
  if (!version) return false;

  const a = version.split(".").map((x) => Number(x));
  const b = minVersion.split(".").map((x) => Number(x));
  const len = Math.max(a.length, b.length);

  for (let i = 0; i < len; i += 1) {
    const av = Number.isFinite(a[i]) ? a[i] : 0;
    const bv = Number.isFinite(b[i]) ? b[i] : 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }

  return true;
}

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

function isDesktopTelegramPlatform(platform?: string) {
  const value = platform?.toLowerCase();
  if (!value) return false;

  return ["tdesktop", "macos", "windows", "linux", "web", "weba", "webk"].includes(value);
}

export function TgBoot() {
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg) return;

    const shouldForceFullscreen = !isDesktopTelegramPlatform(tg.platform);

    const forceFullscreen = () => {
      try {
        if (shouldForceFullscreen) {
          tg.expand?.();
          if (isVersionAtLeast(tg.version, "8.0")) {
            tg.requestFullscreen?.();
          }
        } else if (tg.isFullscreen && isVersionAtLeast(tg.version, "8.0")) {
          tg.exitFullscreen?.();
        }
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
