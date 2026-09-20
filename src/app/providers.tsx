"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { SWRConfig, useSWRConfig } from "swr";
import Lottie from "lottie-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import loadingAnimation from "../../public/lottie.json";
import type { SeriesRow } from "@/types/bootstrap";
import { fetcher } from "@/lib/fetcher";
import { getTelegramInitData } from "@/types/telegram";

type TelegramAuthStatus = "checking" | "authenticated" | "unavailable" | "failed";

type TelegramAuthValue = {
  status: TelegramAuthStatus;
  retry: () => void;
};

const TelegramAuthContext = createContext<TelegramAuthValue>({
  status: "checking",
  retry: () => {},
});

const INIT_DATA_RETRIES_MS = [0, 60, 160, 320, 650, 1100, 1800, 3000, 5000, 8000];

function TelegramAuthGate({ children }: { children: React.ReactNode }) {
  const runId = useRef(0);
  const [status, setStatus] = useState<TelegramAuthStatus>("checking");
  const { mutate } = useSWRConfig();
  const reducedMotion = useReducedMotion();
  const { data: library, error: libraryError } = useSWR<SeriesRow[]>(
    status === "authenticated" ? "/api/series" : null,
    fetcher
  );
  const loading = status === "checking" ||
    (status === "authenticated" && library === undefined && !libraryError);

  const authenticate = useCallback(async () => {
    const currentRun = ++runId.current;
    setStatus("checking");
    const finish = () => {
      // The original cache predates multi-account Telegram authentication.
      try {
        localStorage.removeItem("series_cache_v3");
        localStorage.removeItem("last_marked_series_id");
      } catch { /* Storage can be unavailable inside a webview. */ }
      setStatus("authenticated");
    };

    const existingSession = await fetch("/api/auth/telegram", {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
    if (currentRun !== runId.current) return;
    const session = existingSession?.ok ? await existingSession.json().catch(() => null) : null;
    if (session?.demo) {
      finish();
      return;
    }

    for (let index = 0; index < INIT_DATA_RETRIES_MS.length; index += 1) {
      const delay = INIT_DATA_RETRIES_MS[index] - (INIT_DATA_RETRIES_MS[index - 1] ?? 0);
      if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
      if (currentRun !== runId.current) return;

      const initData = getTelegramInitData();
      if (!initData) continue;

      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      }).catch(() => null);

      if (currentRun !== runId.current) return;
      if (!response?.ok) {
        setStatus("failed");
        return;
      }

      await mutate(() => true, undefined, { revalidate: false });
      finish();
      return;
    }

    if (currentRun === runId.current) {
      if (session?.authenticated) finish();
      else setStatus("unavailable");
    }
  }, [mutate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void authenticate(), 0);
    return () => {
      window.clearTimeout(timer);
      runId.current += 1;
    };
  }, [authenticate]);

  const retry = useCallback(() => void authenticate(), [authenticate]);
  const value = useMemo(() => ({ status, retry }), [status, retry]);

  return (
    <TelegramAuthContext.Provider value={value}>
      {status === "authenticated" && !loading ? children : !loading ? (
        <main className="mx-auto min-h-dvh max-w-[420px] bg-white px-5 pt-16">
          <p role="alert" className="ty-body-16-medium">Не удалось войти через Telegram</p>
          <button onClick={retry} className="mt-4 rounded-full bg-black px-5 py-3 text-white">Повторить вход</button>
        </main>
      ) : null}
      <AnimatePresence>
        {loading ? <motion.div
          key="startup-loader"
          role="status"
          aria-label="Загрузка приложения"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-white"
          initial={false}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.24 }}
        >
          <div className="h-24 w-24" aria-hidden="true">
            <Lottie animationData={loadingAnimation} loop={!reducedMotion} autoplay={!reducedMotion} />
          </div>
        </motion.div> : null}
      </AnimatePresence>
    </TelegramAuthContext.Provider>
  );
}

export function useTelegramAuth() {
  return useContext(TelegramAuthContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 10_000 }}>
      <TelegramAuthGate>{children}</TelegramAuthGate>
    </SWRConfig>
  );
}
