"use client";

import React, { useEffect, useRef, useState } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";
import type { BootstrapResponse } from "@/types/bootstrap";
import { getTelegramWebApp } from "@/types/telegram";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForTelegramInitData(timeoutMs = 1500): Promise<string | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tg = getTelegramWebApp();
    const initData: string | undefined = tg?.initData;
    if (initData && initData.length > 0) return initData;
    await sleep(50);
  }
  return null;
}

async function telegramAuthIfNeeded() {
  const initData = await waitForTelegramInitData(2000);
  if (!initData) return;

  const r = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ initData }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Telegram auth failed: ${r.status} ${t}`);
  }
}

function BootGate({ children }: { children: React.ReactNode }) {
  const { mutate: mutateGlobal } = useSWRConfig();

  const [error, setError] = useState<string | null>(null);

  const didBootRef = useRef(false);

  useEffect(() => {
    if (didBootRef.current) return;
    didBootRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        setError(null);
        // если уже делали boot в этой сессии — не повторяем
        try {
          if (sessionStorage.getItem("boot_done") === "1") {
            return;
          }
        } catch {}

        // 1) auth (cookie)
        await telegramAuthIfNeeded();
        if (cancelled) return;

        // 2) bootstrap in one request (series + seasons + first-season episodes)
        const bootstrap = await fetcher<BootstrapResponse>("/api/bootstrap");
        if (cancelled) return;

        await mutateGlobal("/api/series", bootstrap.series, { revalidate: false });

        const inProgressCount = bootstrap.series.filter((s) => {
          const p = s.progress?.percent ?? 0;
          return p > 0 && p < 100;
        }).length;
        await mutateGlobal("/api/series/in-progress-count", { inProgressCount }, { revalidate: false });

        for (const [seriesId, seasons] of Object.entries(bootstrap.seasonsBySeries ?? {})) {
          await mutateGlobal(`/api/series/${seriesId}/seasons`, seasons, { revalidate: false });
        }

        for (const [seasonId, episodes] of Object.entries(bootstrap.episodesBySeason ?? {})) {
          await mutateGlobal(`/api/seasons/${seasonId}/episodes`, episodes, { revalidate: false });
        }

        if (cancelled) return;

        try {
          sessionStorage.setItem("boot_done", "1");
        } catch {}

      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Boot failed";
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mutateGlobal]);

  return (
    <>
      {error ? (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-black/60 shadow-sm">
          Boot: {error}
        </div>
      ) : null}
      {children}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        keepPreviousData: true,
        dedupingInterval: 10_000,
      }}
    >
      <BootGate>{children}</BootGate>
    </SWRConfig>
  );
}


