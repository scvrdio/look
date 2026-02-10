"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";

import { pluralRu } from "@/lib/plural";
import { fetcher } from "@/lib/fetcher";

import { SeriesCard } from "../components/series/SeriesCard";
import { SeriesSheet } from "../components/series/SeriesSheet";
import { Button } from "../components/ui/button";

type Me = { name: string | null };

type InProgress = { inProgressCount: number };

function getTgFirstName(): string | null {
  if (typeof window === "undefined") return null;

  const tg = (window as any)?.Telegram?.WebApp;
  const n = tg?.initDataUnsafe?.user?.first_name;
  return typeof n === "string" && n.trim() ? n.trim() : null;
}

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

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");

  const { data: items, mutate: mutateSeries } = useSWR<SeriesRow[]>("/api/series", fetcher);

  const [listReady, setListReady] = useState(false);

  const { data: me } = useSWR<Me>("/api/me", fetcher);
  const { data: prog } = useSWR<InProgress>("/api/series/in-progress-count", fetcher);

  const firstName = (me?.name ?? null) || getTgFirstName() || "друг";
  const inProgressCount = prog?.inProgressCount ?? 0;


  useEffect(() => {
    if (!listReady && items) setListReady(true);
  }, [items, listReady]);

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+56px)] pb-28">
        <div className="mt-2">
          <div className="ty-h1 text-[24px] leading-[1.2] pl-2">
            <span className="text-black/20">Привет, </span>
            <span className="text-black">{firstName}!</span>
            <span className="text-black/20"> Что будем</span>
            <br />
            <span className="text-black/20">смотреть сегодня? У тебя</span>
            <br />
            <span className="text-black/20">на очереди </span>
            <span className="text-black">{inProgressCount} сериал{pluralRu(inProgressCount, "ов", "а", "ов")}</span>
          </div>
        </div>


        <div
          className={[
            "mt-6 space-y-2 transition-all duration-500 ease-out",
            listReady ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-12 blur-[8px]",
          ].join(" ")}
        >
          {(items ?? []).map((s) => {
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
        <div className="mx-auto max-w-[420px] px-5 pt-3 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)]">
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
        onChanged={() => void mutateSeries()}
      />
    </main>
  );
}
