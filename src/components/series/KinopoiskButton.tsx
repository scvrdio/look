"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { kinopoiskPage, kinopoiskSearch, type KinopoiskLink } from "@/lib/kinopoisk";
import { hapticImpact } from "@/lib/haptics";
import { getTelegramWebApp } from "@/types/telegram";

export function KinopoiskButton({ seriesId, title, active = true }: { seriesId: string; title: string; active?: boolean }) {
  const movieId = /^movie:([1-9]\d*)$/.exec(seriesId)?.[1];
  const movieLink = movieId ? kinopoiskPage(Number(movieId), "movie") : null;
  const { data, isLoading } = useSWR<KinopoiskLink>(active && !movieLink ? `/api/series/${seriesId}/kinopoisk` : null, fetcher, {
    revalidateOnFocus: false, dedupingInterval: 3600000, shouldRetryOnError: false,
  });
  const link = movieLink ?? data ?? kinopoiskSearch(title);
  const label = link.exact ? "Открыть на Кинопоиске" : "Найти на Кинопоиске";
  return <a
    href={link.url} target="_blank" rel="noopener noreferrer"
    aria-label={label} title={label} aria-busy={isLoading}
    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
    onClick={event => {
      hapticImpact("light");
      const telegram = getTelegramWebApp();
      // iOS Telegram intercepts _blank in createWebViewWith and opens its browser.
      // Same-frame links reach WebKit's navigation policy, allowing Universal Links.
      // Keep the user's synchronous anchor activation; no openLink or window.open.
      event.currentTarget.target = link.exact && telegram?.initData && telegram.platform === "ios"
        ? "_self"
        : "_blank";
    }}
  >
    <img src="/kinopoisk.svg" alt="" width={44} height={44} className="h-11 w-11" />
  </a>;
}
