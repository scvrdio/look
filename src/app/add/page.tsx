"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { pluralRu } from "@/lib/plural";

import { PlaylistPlusFill, Search, XCircleFill } from "@/icons";

type SeriesRow = {
  id: string;
  title: string;
  source?: string | null;
  sourceId?: number | null;
};

type Item = {
  id: number;
  name: string;
  year: number | null;
  posterUrl: string | null;
  type: string | null;
  seasonsCount?: number | null;
  episodesCount?: number | null;

  _localSeriesId?: string;
  _alreadyInDb?: boolean;
};

async function readErrorMessage(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    return String(json?.message || json?.error || text || `Request failed: ${res.status}`);
  } catch {
    return text || `Request failed: ${res.status}`;
  }
}

function metaTypeLabel(type: string | null) {
  if (!type) return "";
  return type === "tv-series" ? "Сериал" : type;
}

function metaCountsLine(seasonsCount?: number | null, episodesCount?: number | null) {
  const seasons = seasonsCount ?? null;
  const episodes = episodesCount ?? null;

  if (seasons == null && episodes == null) return null;

  const parts: string[] = [];
  if (seasons != null) parts.push(`${seasons} ${pluralRu(seasons, "Сезон", "Сезона", "Сезонов")}`);
  if (episodes != null) parts.push(`${episodes} ${pluralRu(episodes, "Серия", "Серии", "Серий")}`);
  return parts.join(", ");
}

export default function AddPage() {

  const router = useRouter();

  // animations
  const [headerReady, setHeaderReady] = useState(false);
  const [listReady, setListReady] = useState(false);

  // placeholder typing
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
  const [placeholder, setPlaceholder] = useState("");

  // screen state
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<"idle" | "ready" | "results">("idle");
  const [source, setSource] = useState<"db" | "catalog">("db");

  // results
  const [results, setResults] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // autofocus (safe)
  const inputRef = useRef<HTMLInputElement | null>(null);

useEffect(() => {
  const t = setTimeout(() => {
    inputRef.current?.focus();
  }, 120);
  return () => clearTimeout(t);
}, []);

  // already added
  const { data: mySeries } = useSWR<SeriesRow[]>("/api/series", fetcher, {
    revalidateOnFocus: false,
  });

  const existingIds = useMemo(() => {
    return new Set(
      (mySeries ?? [])
        .filter((s) => s.source === "poiskkino" && typeof s.sourceId === "number")
        .map((s) => s.sourceId as number)
    );
  }, [mySeries]);

  // header enter
  useEffect(() => {
    const t = requestAnimationFrame(() => setHeaderReady(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // list enter when results appear
  useEffect(() => {
    if (step !== "results") return;
    const t = requestAnimationFrame(() => setListReady(true));
    return () => cancelAnimationFrame(t);
  }, [step, results.length]);

  // typing placeholder (only when query is empty)
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
    setSource("db");
    setQuery(v);
    setError(null);

    if (v.trim().length === 0) {
      setStep("idle");
      setResults([]);
      return;
    }
    if (step !== "results") setStep("ready");
  }

  function clear() {
    hapticImpact("light");
    setQuery("");
    setResults([]);
    setError(null);
    setStep("idle");
  }

  const [addingId, setAddingId] = useState<number | null>(null);

  async function addFromCatalog(id: number) {
    if (addingId) return;
    if (existingIds.has(id)) return;

    hapticImpact("medium");
    setAddingId(id);
    setError(null);

    try {
      const res = await fetch("/api/series/import/poiskkino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        hapticNotify("error");
        setError(await readErrorMessage(res));
        return;
      }

      hapticNotify("success");
      router.push("/");
    } catch {
      hapticNotify("error");
      setError("Ошибка сети. Попробуйте еще раз.");
    } finally {
      setAddingId(null);
    }
  }

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;

    setListReady(false);

    hapticImpact("medium");
    setSearching(true);
    setError(null);

    try {
      const url =
        source === "db"
          ? `/api/series/search?q=${encodeURIComponent(q)}`
          : `/api/poiskkino/search?query=${encodeURIComponent(q)}&limit=10`;

      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        hapticNotify("error");
        const msg = await readErrorMessage(res);
        setError(msg);
        if (res.status === 429) setStep("ready");
        return;
      }

      const data = await res.json();

      if (source === "db") {
        const items = Array.isArray(data?.items) ? data.items : [];
        setResults(
          items.map((s: any) => ({
            id: s.sourceId ?? 0,
            name: s.title,
            year: s.year ?? null,
            posterUrl: s.posterUrl ?? null,
            type: s.kind === "movie" ? "movie" : "tv-series",
            seasonsCount: s.seasonsCount ?? null,
            episodesCount: s.episodesCount ?? null,
            _localSeriesId: s.id,
            _alreadyInDb: true,
          }))
        );
        setStep("results");
        return;
      }

      setResults(Array.isArray(data?.items) ? data.items : []);
      setStep("results");
    } catch {
      hapticNotify("error");
      setError("Ошибка сети. Попробуйте еще раз.");
    } finally {
      setSearching(false);
    }
  }

  const rightIcon = query.trim().length > 0 ? "clear" : "search";

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+64px)] pb-28">
        {/* Header */}
        <div
          className={[
            "flex items-center gap-3 transition-all duration-500 ease-out",
            headerReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-[8px]",
          ].join(" ")}
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              inputMode="search"
              enterKeyHint="search"
              placeholder={placeholder}
              className="w-full h-11 rounded-full bg-black/2 px-4 pr-10 text-[16px] font-medium outline-[1px] outline-black/5 placeholder:text-black/30"
            />

            <button
              type="button"
              onClick={() => {
                if (rightIcon === "clear") clear();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-full"
              aria-label={rightIcon === "clear" ? "Clear" : "Search icon"}
              disabled={rightIcon !== "clear"}
            >
              {rightIcon === "clear" ? (
                <XCircleFill className="w-5 h-5 text-black/30" />
              ) : (
                <Search className="w-6 h-6 text-black/30" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              hapticImpact("light");
              router.push("/");
            }}
            className="text-[16px] opacity-50"
          >
            Назад
          </button>
        </div>

        {/* Results */}
        {step === "results" && (
          <div className="mt-6 space-y-3">
            {results.length === 0 ? (
              <div className="text-[14px] opacity-60 px-1">Ничего не найдено</div>
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
                      <div className="w-[80px] h-[120px] rounded-[8px] overflow-hidden bg-[#F2F2F2] shrink-0">
                        {item.posterUrl ? (
                          <img src={item.posterUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : null}
                      </div>

                      <div className="flex-1 min-w-0 pt-1 flex flex-col justify-between h-[120px]">
                        <div className="min-w-0">
                          <div className="text-[16px] font-medium leading-[20px] truncate">{item.name}</div>

                          <div className="text-[14px] leading-[18px] text-black/50 mt-1">
                            {item.year ?? ""}
                            {typeLabel ? ` · ${typeLabel}` : ""}
                          </div>

                          {countsLine ? (
                            <div className="text-[14px] leading-[18px] text-black/50 mt-1">{countsLine}</div>
                          ) : null}
                        </div>

                        <div className="pt-3">
                          {fromDb ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!item._localSeriesId) return;
                                hapticImpact("light");
                                sessionStorage.setItem("openSeriesId", item._localSeriesId);
                                router.push("/");
                              }}
                              className="inline-flex items-center gap-2 h-8 pl-3 pr-3 rounded-[8px] bg-[#F2F2F2] text-[13px] font-medium"
                            >
                              <span className="text-[16px] leading-none">↗</span>
                              <span>Открыть</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addFromCatalog(item.id)}
                              disabled={already || addingId === item.id}
                              className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[#F2F2F2] text-[14px] font-medium disabled:opacity-40"
                            >
                              <PlaylistPlusFill className="w-4 h-4 text-black" />
                              <span>{already ? "В списке" : addingId === item.id ? "..." : "Добавить"}</span>
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
        )}

        {error && <div className="mt-3 text-[12px] text-red-500">{error}</div>}
      </div>

      {/* Bottom button */}
      {/* {step === "ready" && (
        <div className="fixed inset-x-0 bottom-0 bg-white">
          <div className="mx-auto max-w-[420px] px-5 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)] pt-3">
            <Button type="button" onClick={runSearch} disabled={searching || query.trim().length < 2}>
              {searching ? "Поиск..." : "Поиск"}
            </Button>
          </div>
        </div>
      )} */}
    </main>
  );
}
