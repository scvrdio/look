"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { SeriesCard } from "../components/series/SeriesCard";
import { SeriesSheet } from "../components/series/SeriesSheet";
import { Button } from "../components/ui/button";

type SeriesRow = {
  id: string;
  title: string;
  seasonsCount: number;
  progress: {
    percent: number;
    last: { season: number; episode: number } | null;
  };
};

export default function HomePage() {
  const [items, setItems] = useState<SeriesRow[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");

  async function load() {
    const res = await fetch("/api/series", { cache: "no-store" });
    const data = (await res.json()) as SeriesRow[];
    setItems(data);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-[420px] px-4 pt-6 pb-28">
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
                subtitle={`${s.seasonsCount} сезона`}
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

      <div className="fixed inset-x-0 bottom-0 bg-white">
        <div className="mx-auto max-w-[420px] px-5 pb-5 pt-3">
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
