"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { hapticImpact, hapticNotify } from "@/lib/haptics";

type SeriesRow = {
    id: string;
    title: string;
    source?: string | null;
    sourceId?: number | null;
};

type Item = {
    id: number; // внешний id (для catalog), для db может быть 0
    name: string;
    year: number | null;
    posterUrl: string | null;
    type: string | null;
    seasonsCount?: number | null;
    episodesCount?: number | null;

    // internal
    _localSeriesId?: string;
    _alreadyInDb?: boolean;
};

type SearchResponse = {
    items: Item[];
    page: number;
    limit: number;
    total?: number | null;
    pages?: number | null;
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

export default function AddPage() {
    const router = useRouter();

    // 0) состояние экрана
    const [query, setQuery] = useState("");
    const [step, setStep] = useState<"idle" | "ready" | "results">("idle");
    const [source, setSource] = useState<"db" | "catalog">("db");

    // 1) результаты поиска (только по кнопке)
    const [results, setResults] = useState<Item[]>([]);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 2) уже добавленные (для "В списке")
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

    function onChange(v: string) {
        setSource("db");
        setQuery(v);
        setError(null);
        if (v.trim().length === 0) {
            setStep("idle");
            setResults([]);
            return;
        }
        // ввод есть, но поиск ещё не запущен
        if (step !== "results") setStep("ready");
    }

    function clear() {
        hapticImpact("light");
        setQuery("");
        setResults([]);
        setError(null);
        setStep("idle");
    }

    async function runSearch() {
        const q = query.trim();
        if (q.length < 2) return;

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
                if (res.status === 429) setStep("ready"); // остаёмся на экране с кнопкой
                return;
            }

            const data = await res.json();

            if (source === "db") {
                const items = Array.isArray(data?.items) ? data.items : [];
                // приводим к формату results Item
                setResults(
                    items.map((s: any) => ({
                        id: s.sourceId ?? 0,            // внешний id может быть null/0, неважно
                        name: s.title,
                        year: s.year ?? null,
                        posterUrl: s.posterUrl ?? null,
                        type: s.kind === "movie" ? "movie" : "tv-series",
                        seasonsCount: s.seasonsCount ?? null,
                        episodesCount: s.episodesCount ?? null,

                        _localSeriesId: s.id,           // ВАЖНО: local id
                        _alreadyInDb: true,             // ВАЖНО: флаг
                    }))
                );
                setStep("results");
                return;
            }

            setResults(Array.isArray(data.items) ? data.items : []);
            setStep("results");
        } catch {
            hapticNotify("error");
            setError("Ошибка сети. Попробуйте еще раз.");
        } finally {
            setSearching(false);
        }
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

    const rightIcon = query.trim().length > 0 ? "clear" : "search";

    return (
        <main className="min-h-dvh bg-white">
            <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+64px)] pb-28">
                {/* Top row: input + back */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <input
                            value={query}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="Дан Да Дан"
                            className="w-full h-11 rounded-full bg-[#F2F2F2] px-4 pr-10 text-[14px] outline-none"
                        />

                        {/* right icon inside input */}
                        <button
                            type="button"
                            onClick={() => {
                                if (rightIcon === "clear") clear();
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-full"
                            aria-label={rightIcon === "clear" ? "Clear" : "Search icon"}
                            disabled={rightIcon !== "clear"}
                        >
                            {rightIcon === "clear" ? (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/20 text-black text-[14px] leading-none">
                                    ×
                                </span>
                            ) : (
                                <span className="text-black/40 text-[16px]">⌕</span>
                            )}
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            hapticImpact("light");
                            router.push("/");
                        }}
                        className="text-[14px] opacity-60"
                    >
                        Назад
                    </button>
                </div>

                {/* Results list */}
                {step === "results" && (
                    <div className="mt-6 space-y-3">
                        {results.length === 0 ? (
                            <div className="text-[14px] opacity-60 px-1">Ничего не найдено</div>
                        ) : (
                            results.map((item) => {
                                const fromDb = !!item._alreadyInDb && !!item._localSeriesId;
                                const already = fromDb ? true : existingIds.has(item.id);

                                return (
                                    <div key={fromDb ? item._localSeriesId : item.id} className="flex gap-3">
                                        <div className="w-[72px] h-[96px] rounded-[14px] overflow-hidden bg-[#F2F2F2] shrink-0">
                                            {item.posterUrl ? (
                                                <img
                                                    src={item.posterUrl}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : null}
                                        </div>

                                        <div className="flex-1 min-w-0 pt-1">
                                            <div className="text-[16px] font-semibold leading-[20px] truncate">
                                                {item.name}
                                            </div>

                                            <div className="text-[13px] leading-[18px] text-black/50 mt-1">
                                                {(item.year ?? "")}
                                                {item.type ? ` · ${item.type === "tv-series" ? "Сериал" : item.type}` : ""}
                                            </div>

                                            <div className="mt-3">
                                                {fromDb ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!item._localSeriesId) return;
                                                            hapticImpact("light");
                                                            sessionStorage.setItem("openSeriesId", item._localSeriesId);
                                                            router.push("/");
                                                        }}
                                                        className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[#F2F2F2] text-[14px] font-medium"
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
                                                        <span className="text-[16px] leading-none">💼</span>
                                                        <span>
                                                            {already ? "В списке" : addingId === item.id ? "..." : "Добавить"}
                                                        </span>
                                                    </button>
                                                )}
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

            {/* Bottom button: only in "ready" */}
            {step === "ready" && (
                <div className="fixed inset-x-0 bottom-0 bg-white">
                    <div className="mx-auto max-w-[420px] px-5 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)] pt-3">
                        <Button type="button" onClick={runSearch} disabled={searching || query.trim().length < 2}>
                            {searching ? "Поиск..." : "Поиск"}
                        </Button>
                    </div>
                </div>
            )}
        </main>
    );
}
