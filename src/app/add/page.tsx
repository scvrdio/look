"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { hapticImpact } from "@/lib/haptics";
import { fetcher } from "@/lib/fetcher";

import { PoiskKinoSearch } from "./PoiskKinoSearch";
import { ManualAddForm } from "./ManualAddForm";

type SeriesRow = {
  id: string;
  title: string;
  source?: string | null;
  sourceId?: number | null;
};

export default function AddPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"search" | "manual">("search");

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
  

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+56px)] pb-28">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[24px] ty-h1 pl-1">
            {mode === "search" ? "Добавить" : "Добавить вручную"}
          </h1>

          <button
            type="button"
            onClick={() => {
              hapticImpact("light");
              router.push("/");
            }}
            className="h-10 w-10 rounded-full text-black text-[32px] inline-flex items-center justify-center"
            aria-label="Close"
          >
            <X size={28} strokeWidth={1.5} />
          </button>
        </div>

        {mode === "search" ? (
          <PoiskKinoSearch
            onManual={() => setMode("manual")}
            existingIds={existingIds}
          />
        ) : (
          <ManualAddForm
            onBack={() => setMode("search")}
            onDone={() => router.push("/")}
          />
        )}
      </div>
    </main>
  );
}
