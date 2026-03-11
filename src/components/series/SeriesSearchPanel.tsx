"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";
import Lottie from "lottie-react";

import { PlaylistPlusFill, Search, XCircleFill } from "@/icons";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { pluralRu } from "@/lib/plural";

import type { SeriesRow } from "@/types/bootstrap";
import loadingAnimation from "../../../public/lottie.json";

type Item = {
  id: number;
  name: string;
  year: number | null;
  posterUrl: string | null;
  type: string | null;
  seasonsCount?: number | null;
  episodesCount?: number | null;
  genres?: string[];
  _localSeriesId?: string;
  _alreadyInDb?: boolean;
};

type DbSearchItem = {
  id: string;
  title?: string | null;
  sourceId?: number | null;
  year?: number | null;
  posterUrl?: string | null;
  kind?: string | null;
  seasonsCount?: number | null;
  episodesCount?: number | null;
  genres?: string[] | null;
};

type SeriesSearchPanelProps = {
  items: SeriesRow[];
  onBack: () => void;
  onOpenSeries: (seriesId: string) => void;
};

const SERIES_TYPES = new Set(["tv-series", "anime", "animated-series", "tv-show"]);

function isSeriesType(type: string | null | undefined) {
  if (!type) return false;
  return SERIES_TYPES.has(type);
}

function metaTypeLabel(type: string | null) {
  if (!type) return "";
  if (isSeriesType(type)) return "Сериал";
  if (type === "movie") return "Фильм";
  return type;
}

function metaCountsLine(seasonsCount?: number | null, episodesCount?: number | null) {
  const seasons = seasonsCount ?? null;
  const episodes = episodesCount ?? null;
  if (seasons == null && episodes == null) return null;

  const parts: string[] = [];
  if (seasons != null) parts.push(`${seasons} ${pluralRu(seasons, "сезон", "сезона", "сезонов")}`);
  if (episodes != null) parts.push(`${episodes} ${pluralRu(episodes, "серия", "серии", "серий")}`);
  return parts.join(", ");
}

function canSearch(raw: string) {
  const q = raw.trim();
  if (!q) return false;

  if (!/\s/.test(q)) {
    if (q.length <= 2) return /^[\p{L}\p{N}]+$/u.test(q);
    return q.length >= 2;
  }

  return q.length >= 2;
}

async function readErrorMessage(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    return String(json?.message || json?.error || text || `Request failed: ${res.status}`);
  } catch {
    return text || `Request failed: ${res.status}`;
  }
}

export function SeriesSearchPanel({ items, onBack, onOpenSeries }: SeriesSearchPanelProps) {
  const placeholders = useMemo(
    () => [
      "Тед Лассо",
      "Во все тяжкие",
      "Игра престолов",
      "Очень странные дела",
      "Лучше звоните Солу",
      "Друзья",
      "Игра в кальмара",
      "Наследники",
    ],
    []
  );

  const [headerReady, setHeaderReady] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [placeholder, setPlaceholder] = useState("");
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [step, setStep] = useState<"idle" | "ready" | "results">("idle");
  const [results, setResults] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSearchLoader, setShowSearchLoader] = useState(false);
  const [searchLoaderEntered, setSearchLoaderEntered] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);

  const searchLoaderHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchLoaderEnterRaf1Ref = useRef<number | null>(null);
  const searchLoaderEnterRaf2Ref = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const existingIds = useMemo(() => {
    return new Set(
      (items ?? [])
        .filter((s) => s.source === "poiskkino" && typeof s.sourceId === "number")
        .map((s) => s.sourceId as number)
    );
  }, [items]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHeaderReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (step !== "results" || showSearchLoader || results.length === 0) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setListReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [step, showSearchLoader, results.length]);

  useEffect(() => {
    if (searching) {
      if (searchLoaderHideTimerRef.current) {
        clearTimeout(searchLoaderHideTimerRef.current);
        searchLoaderHideTimerRef.current = null;
      }
      return;
    }
    setSearchLoaderEntered(false);
    searchLoaderHideTimerRef.current = setTimeout(() => {
      setShowSearchLoader(false);
      searchLoaderHideTimerRef.current = null;
    }, 180);
  }, [searching]);

  useEffect(() => {
    return () => {
      if (searchLoaderHideTimerRef.current) clearTimeout(searchLoaderHideTimerRef.current);
      if (searchLoaderEnterRaf1Ref.current) cancelAnimationFrame(searchLoaderEnterRaf1Ref.current);
      if (searchLoaderEnterRaf2Ref.current) cancelAnimationFrame(searchLoaderEnterRaf2Ref.current);
    };
  }, []);

  useEffect(() => {
    if (query.trim().length > 0) return;

    let phraseIndex = 0;
    let charIndex = 0;
    let typing = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const full = placeholders[phraseIndex];
      if (typing) {
        charIndex++;
        setPlaceholder(full.slice(0, charIndex));
        if (charIndex >= full.length) {
          typing = false;
          timeout = setTimeout(tick, 1000);
          return;
        }
        timeout = setTimeout(tick, 125);
        return;
      }

      charIndex--;
      setPlaceholder(full.slice(0, charIndex));
      if (charIndex <= 0) {
        typing = true;
        phraseIndex = (phraseIndex + 1) % placeholders.length;
        timeout = setTimeout(tick, 300);
        return;
      }
      timeout = setTimeout(tick, 60);
    };

    setPlaceholder("");
    timeout = setTimeout(tick, 0);

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [query, placeholders]);

  function onChange(v: string) {
    setQuery(v);
    setError(null);

    const q = v.trim();
    if (q.length === 0) {
      setCommittedQuery("");
      setResults([]);
      setStep("idle");
      return;
    }

    if (step === "results") return;
    setStep("ready");
  }

  function clear() {
    hapticImpact("light");
    setQuery("");
    setCommittedQuery("");
    setResults([]);
    setError(null);
    setSearching(false);
    setStep("idle");
    inputRef.current?.focus({ preventScroll: true });
  }

  async function addFromCatalog(id: number) {
    if (addingId || existingIds.has(id)) return;

    hapticImpact("medium");
    setAddingId(id);
    setError(null);

    try {
      const res = await fetch("/api/series/import/poiskkino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        hapticNotify("error");
        setError(await readErrorMessage(res));
        return;
      }

      hapticNotify("success");
      await Promise.all([
        mutate("/api/series"),
        mutate("/api/series/in-progress-count"),
      ]);
      onBack();
    } catch {
      hapticNotify("error");
      setError("Ошибка сети. Попробуйте еще раз.");
    } finally {
      setAddingId(null);
    }
  }

  async function runSearch(raw?: string) {
    const q = (raw ?? query).trim();
    if (!canSearch(q)) {
      if (q.length === 0) {
        setCommittedQuery("");
        setResults([]);
        setStep("idle");
      }
      return;
    }

    setCommittedQuery(q);
    setListReady(false);
    setResults([]);
    setStep("results");

    if (searchLoaderHideTimerRef.current) {
      clearTimeout(searchLoaderHideTimerRef.current);
      searchLoaderHideTimerRef.current = null;
    }
    if (searchLoaderEnterRaf1Ref.current) {
      cancelAnimationFrame(searchLoaderEnterRaf1Ref.current);
      searchLoaderEnterRaf1Ref.current = null;
    }
    if (searchLoaderEnterRaf2Ref.current) {
      cancelAnimationFrame(searchLoaderEnterRaf2Ref.current);
      searchLoaderEnterRaf2Ref.current = null;
    }

    setSearchLoaderEntered(false);
    setShowSearchLoader(true);
    searchLoaderEnterRaf1Ref.current = requestAnimationFrame(() => {
      searchLoaderEnterRaf2Ref.current = requestAnimationFrame(() => {
        setSearchLoaderEntered(true);
      });
    });

    hapticImpact("medium");
    setSearching(true);
    setError(null);

    try {
      const [resDb, resCat] = await Promise.all([
        fetch(`/api/series/search?q=${encodeURIComponent(q)}`, { cache: "no-store" }),
        fetch(`/api/poiskkino/search?query=${encodeURIComponent(q)}&limit=10&includeMovies=1`, { cache: "no-store" }),
      ]);

      let dbMapped: Item[] = [];
      if (resDb.ok) {
        const dataDb = await resDb.json().catch(() => null);
        const dbItems: DbSearchItem[] = Array.isArray(dataDb?.items) ? (dataDb.items as DbSearchItem[]) : [];
        dbMapped = dbItems.map((s) => ({
          id: typeof s.sourceId === "number" ? s.sourceId : 0,
          name: s.title ?? "",
          year: s.year ?? null,
          posterUrl: s.posterUrl ?? null,
          type: s.kind ?? "tv-series",
          seasonsCount: s.seasonsCount ?? null,
          episodesCount: s.episodesCount ?? null,
          genres: Array.isArray(s.genres) ? s.genres : undefined,
          _localSeriesId: s.id,
          _alreadyInDb: true,
        }));
      } else if (resDb.status !== 401) {
        setError(await readErrorMessage(resDb));
      }

      let catItems: Item[] = [];
      if (resCat.ok) {
        const dataCat = await resCat.json().catch(() => null);
        catItems = Array.isArray(dataCat?.items) ? dataCat.items : [];
      } else {
        setError(await readErrorMessage(resCat));
      }

      const dbSourceIds = new Set<number>(
        dbMapped
          .map((x) => x.id)
          .filter((x) => typeof x === "number" && x > 0)
      );

      const catFiltered = catItems.filter((it) => {
        if (typeof it?.id !== "number") return false;
        if (dbSourceIds.has(it.id)) return false;
        if (existingIds.has(it.id)) return false;
        return true;
      });

      setResults([...dbMapped, ...catFiltered]);
      setStep("results");
    } catch {
      hapticNotify("error");
      setError("Ошибка сети. Попробуйте еще раз.");
      setResults([]);
      setStep("results");
    } finally {
      setSearching(false);
    }
  }

  const rightIcon = query.trim().length > 0 ? "clear" : "search";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={[
          "flex items-center gap-3 transition-all duration-500 ease-out",
          headerReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-[8px]",
        ].join(" ")}
      >
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const input = inputRef.current;
            const raw = input?.value ?? query;
            void runSearch(raw);
            input?.blur();
          }}
        >
          <input
            ref={inputRef}
            value={query}
            type="text"
            onChange={(e) => onChange(e.target.value)}
            inputMode="text"
            enterKeyHint="search"
            placeholder={placeholder}
            className="h-11 w-full rounded-full bg-black/2 px-4 pr-10 text-[16px] font-medium outline-[1px] outline-black/5 placeholder:text-black/30"
          />

          <button
            type="button"
            onPointerDown={(e) => {
              if (rightIcon !== "clear") return;
              e.preventDefault();
            }}
            onClick={() => {
              if (rightIcon === "clear") clear();
            }}
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full"
            aria-label={rightIcon === "clear" ? "Clear" : "Search icon"}
            disabled={rightIcon !== "clear"}
          >
            {rightIcon === "clear" ? (
              <XCircleFill className="h-5 w-5 text-black/30" />
            ) : (
              <Search className="h-6 w-6 text-black/30" />
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            hapticImpact("light");
            onBack();
          }}
          className="text-[16px] opacity-50"
        >
          Назад
        </button>
      </div>

      {step === "results" ? (
        <div className="mt-6 space-y-3 pb-4">
          {showSearchLoader ? (
            <div
              className={[
                "flex h-[220px] items-center justify-center transition-all duration-200 ease-out",
                searchLoaderEntered ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-95 blur-[8px]",
              ].join(" ")}
            >
              <div className="w-[180px]">
                <Lottie animationData={loadingAnimation} loop autoplay />
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="px-1 text-[14px] opacity-60">
              {searching ? "Поиск..." : committedQuery ? `Ничего не найдено по "${committedQuery}"` : "Ничего не найдено"}
            </div>
          ) : (
            results.map((item, i) => {
              const fromDb = !!item._alreadyInDb && !!item._localSeriesId;
              const already = fromDb ? true : existingIds.has(item.id);
              const typeLabel = metaTypeLabel(item.type);
              const countsLine = metaCountsLine(item.seasonsCount, item.episodesCount);
              const key = fromDb ? (item._localSeriesId as string) : String(item.id);

              return (
                <div
                  key={key}
                  style={{ transitionDelay: `${i * 80}ms` }}
                  className={[
                    "transition-all duration-500 ease-out",
                    listReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-12 blur-[8px]",
                  ].join(" ")}
                >
                  <div className="flex gap-3">
                    <div className="h-[120px] w-[80px] shrink-0 overflow-hidden rounded-[8px] bg-[#F2F2F2]">
                      {item.posterUrl ? (
                        <img src={item.posterUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : null}
                    </div>

                    <div className="flex h-[120px] min-w-0 flex-1 flex-col justify-between pt-1">
                      <div className="min-w-0">
                        <div className="truncate text-[16px] font-medium leading-[20px]">{item.name}</div>

                        <div className="mt-1 text-[14px] leading-[18px] text-black/50">
                          {item.year ?? ""}
                          {typeLabel ? ` · ${typeLabel}` : ""}
                        </div>

                        {item.genres?.length ? (
                          <div className="mt-1 text-[14px] text-black/50">{item.genres.join(" · ")}</div>
                        ) : null}

                        {countsLine ? (
                          <div className="mt-1 text-[14px] leading-[18px] text-black/50">{countsLine}</div>
                        ) : null}
                      </div>

                      <div className="pt-3">
                        {fromDb ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!item._localSeriesId) return;
                              hapticImpact("light");
                              onBack();
                              onOpenSeries(item._localSeriesId);
                            }}
                            className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#F2F2F2] px-3 text-[13px] font-medium"
                          >
                            <span className="text-[16px] leading-none">↗</span>
                            <span>Открыть</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addFromCatalog(item.id)}
                            disabled={already || addingId === item.id}
                            className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#F2F2F2] px-3 text-[13px] font-medium disabled:opacity-40"
                          >
                            <PlaylistPlusFill className="h-4 w-4 text-black" />
                            <span>{already ? "В списке" : addingId === item.id ? "Добавление..." : "Добавить"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {error ? <div className="mt-3 text-[12px] text-red-500">{error}</div> : null}
    </div>
  );
}
