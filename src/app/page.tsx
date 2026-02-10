"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pluralRu } from "@/lib/plural";

import { SeriesCard } from "../components/series/SeriesCard";
import { SeriesSheet } from "../components/series/SeriesSheet";
import { Button } from "../components/ui/button";

type SeriesRow = {
  id: string;
  title: string;
  seasonsCount: number;
  episodesCount: number;
  progress: {
    percent: number;
    last: { season: number; episode: number } | null;
  };
};

async function telegramAuthIfNeeded() {
  const tg = (window as any)?.Telegram?.WebApp;

  console.log("tg exists:", !!tg);
  console.log("initData len:", tg?.initData?.length ?? 0);
  console.log(
    "initData head:",
    String(tg?.initData ?? "").slice(0, 60)
  );

  const initData = tg?.initData;
  if (!initData) return;

  const r = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Telegram auth failed: ${r.status} ${t}`);
  }
}


export default function HomePage() {
  const [items, setItems] = useState<SeriesRow[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");

  async function load() {
    const res = await fetch("/api/series", { cache: "no-store" });
    if (!res.ok) throw new Error(`load failed: ${res.status}`);
    const data = (await res.json()) as SeriesRow[];
    setItems(data);
  }

  useEffect(() => {
    (async () => {
      try {
        await telegramAuthIfNeeded();
      } catch (e) {
        console.error(e);
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+24px)] pb-28">
        <h1 className="text-[32px] ty-h1">Коллекция</h1>

        <div className="mt-6 space-y-2">
          {items.map((s) => {
            const rightTop = s.progress?.last
              ? `S${s.progress.last.season} E${s.progress.last.episode}`
              : "";

            const rightBottom = `${s.progress?.percent ?? 0}%`;

            return (
              <SeriesCard
                key={s.id}
                title={s.title}
                subtitle={`${s.seasonsCount} ${pluralRu(
                  s.seasonsCount,
                  "сезон",
                  "сезона",
                  "сезонов"
                )}, ${s.episodesCount} ${pluralRu(
                  s.episodesCount,
                  "серия",
                  "серии",
                  "серий"
                )}`}
                rightTop={rightTop}
                rightBottom={rightBottom}
                onClick={() => {
                  setActiveSeriesId(s.id);
                  setActiveTitle(s.title);
                  setSheetOpen(true);
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0">
        <div className="mx-auto max-w-[420px] px-5 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)] pt-3">
          <Link href="/add" className="block">
            <Button>Добавить сериал</Button>
          </Link>
        </div>
      </div>

      <SeriesSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        seriesId={activeSeriesId}
        title={activeTitle}
        onChanged={load}
      />
    </main>
  );
}
