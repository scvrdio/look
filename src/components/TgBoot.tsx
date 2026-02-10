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
  
      // оставляем expand, safe-area, viewport vars
      tg.expand();
  
      const applyInsets = () => {
        // твой код установки CSS vars на body
      };
  
      applyInsets();
  
      tg.onEvent?.("safeAreaChanged", applyInsets);
      tg.onEvent?.("contentSafeAreaChanged", applyInsets);
      tg.onEvent?.("viewportChanged", () => {
        // твой код --tg-viewport-height/--tg-viewport-stable-height + повтор expand
        tg.expand();
      });
  
      return () => {
        tg.offEvent?.("safeAreaChanged", applyInsets);
        tg.offEvent?.("contentSafeAreaChanged", applyInsets);
        tg.offEvent?.("viewportChanged", applyInsets as any);
      };
    }, []);
  
    return null;
  }