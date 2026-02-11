"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { fetcher } from "@/lib/fetcher";

type Item = {
  id: number;
  name: string;
  year: number | null;
  posterUrl: string | null;
  type: string | null;
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

export function PoiskKinoSearch(props: {
  onManual: () => void;
  existingIds: Set<number>;
}) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return null;
    return `/api/poiskkino/search?query=${encodeURIComponent(q)}&limit=20`;
  }, [query]);

  const { data, isLoading } = useSWR<SearchResponse>(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const items = data?.items ?? [];
  const showEmpty = !isLoading && query.trim().length >= 2 && items.length === 0;

  async function addFromCatalog(id: number) {
    if (addingId) return;
    if (props.existingIds.has(id)) return;

    hapticImpact("medium");
    setError(null);
    setAddingId(id);

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
      mutate("/api/series");
      router.push("/");
    } catch {
      hapticNotify("error");
      setError("Ошибка сети. Попробуйте еще раз.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по каталогу"
        className="w-full h-11 rounded-full bg-[#F2F2F2] px-4 text-[14px] outline-none"
      />

      {isLoading && <div className="text-[14px] opacity-60 px-1">Поиск…</div>}

      {showEmpty && (
        <div className="space-y-3 px-1">
          <div className="text-[14px] opacity-60">Ничего не найдено</div>
          <Button type="button" onClick={props.onManual}>
            Добавить вручную
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const already = props.existingIds.has(item.id);

          return (
            <div key={item.id} className="flex items-center gap-3">
              {item.posterUrl ? (
                <img
                  src={item.posterUrl}
                  alt={item.name}
                  className="w-12 h-12 rounded-full object-cover bg-[#F2F2F2]"
                />
              ) : (
                <div className="w-12 h-16 rounded-lg bg-[#F2F2F2]" />
              )}

              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate">{item.name}</div>
                <div className="text-[12px] opacity-60">
                  {item.year ?? ""} {item.type ? `· ${item.type}` : ""}
                </div>
              </div>

              <Button
                type="button"
                onClick={() => addFromCatalog(item.id)}
                disabled={already || addingId === item.id}
              >
                {already ? "В списке" : addingId === item.id ? "..." : "Добавить"}
              </Button>
            </div>
          );
        })}
      </div>

      {error && <div className="text-[12px] text-red-500">{error}</div>}
    </div>
  );
}
