"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter } from "next/navigation";

import { pluralRu } from "@/lib/plural";
import { fetcher } from "@/lib/fetcher";
import { SeriesCard } from "../components/series/SeriesCard";
import { SeriesSheet } from "../components/series/SeriesSheet";
import { Button } from "../components/ui/button";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { hapticImpact } from "@/lib/haptics";

type Me = { name: string | null };
type InProgress = { inProgressCount: number };

function getTgFirstNameSafe(): string | null {
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

function TitleSeg({
  children,
  delay,
  strong,
}: {
  children: React.ReactNode;
  delay: number;
  strong?: boolean;
}) {
  return (
    <span
      style={{
        animation: "titleRise 520ms cubic-bezier(.2,.8,.2,1) forwards",
        animationDelay: `${delay}ms`,
      }}
      className={[
        "inline-block opacity-0",
        strong ? "text-black" : "text-black/20",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export default function HomePage() {
  const router = useRouter();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);

  // title всегда вычисляем из items, а не храним отдельно (иначе рассинхрон/“Загрузка…”)
  const [listReady, setListReady] = useState(false);
  const [titleReady, setTitleReady] = useState(false);
  const [tgName, setTgName] = useState<string | null>(null);

  const { data: items, mutate: mutateSeries } = useSWR<SeriesRow[]>(
    "/api/series",
    fetcher
  );
  const { data: me } = useSWR<Me>("/api/me", fetcher);
  const { data: prog } = useSWR<InProgress>(
    "/api/series/in-progress-count",
    fetcher
  );

  useEffect(() => {
    setTitleReady(true);
    setTgName(getTgFirstNameSafe());
  }, []);

  useEffect(() => {
    if (!listReady && items) setListReady(true);
  }, [items, listReady]);

  // 1) простой “открыть сериал после возврата”: sessionStorage
  useEffect(() => {
    if (!items || items.length === 0) return;

    const id = sessionStorage.getItem("openSeriesId");
    if (!id) return;

    sessionStorage.removeItem("openSeriesId");

    const exists = items.some((s) => s.id === id);
    if (!exists) return;

    setActiveSeriesId(id);
    setSheetOpen(true);
  }, [items]);

  const activeTitle = useMemo(() => {
    if (!activeSeriesId) return "";
    return (items ?? []).find((s) => s.id === activeSeriesId)?.title ?? "";
  }, [items, activeSeriesId]);

  const firstName = useMemo(
    () => (me?.name ?? null) || tgName || "друг",
    [me?.name, tgName]
  );

  const inProgressCount = prog?.inProgressCount ?? 0;

  return (
    <main className="min-h-dvh bg-white">
      <style jsx global>{`
        @keyframes titleRise {
          from {
            opacity: 0;
            transform: translateY(10px);
            filter: blur(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
      `}</style>

      <div className="mx-auto max-w-[420px] px-4 pb-28 pt-[calc(var(--tg-content-safe-top,0px)+64px)]">
        <div>
          <div className="ty-h1 text-[24px] leading-[1.2] pl-1">
            {titleReady && (
              <>
                <TitleSeg delay={0}>Привет,</TitleSeg>{" "}
                <TitleSeg delay={150} strong>
                  {firstName}!
                </TitleSeg>{" "}
                <TitleSeg delay={300}>Что</TitleSeg>{" "}
                <TitleSeg delay={450}>будем</TitleSeg>
                <br />
                <TitleSeg delay={600}>смотреть</TitleSeg>{" "}
                <TitleSeg delay={750}>сегодня?</TitleSeg>{" "}
                <TitleSeg delay={900}>У тебя</TitleSeg>{" "}
                <br />
                <TitleSeg delay={1050}>на</TitleSeg>{" "}
                <TitleSeg delay={1200}>очереди</TitleSeg>{" "}
                <TitleSeg delay={1350} strong>
                  <AnimatedCounter value={inProgressCount} />
                </TitleSeg>{" "}
                <TitleSeg delay={1500}>
                  сериал{pluralRu(inProgressCount, "", "а", "ов")}
                </TitleSeg>
              </>
            )}

            {!titleReady && (
              <>
                <span className="text-black/20">Привет, </span>
                <span className="text-black">{firstName}!</span>
                <span className="text-black/20"> Что будем</span>
                <br />
                <span className="text-black/20">
                  смотреть сегодня? У тебя
                </span>
                <br />
                <span className="text-black/20">на очереди </span>
                <span className="text-black">
                  {inProgressCount} сериал
                  {pluralRu(inProgressCount, "", "а", "ов")}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {(items ?? []).map((s, i) => {
            const rightTop = s.progress?.last
              ? `S${s.progress.last.season} E${s.progress.last.episode}`
              : "";

            const rightBottom = `${s.progress?.percent ?? 0}%`;
            const completed = (s.progress?.percent ?? 0) === 100;

            return (
              <div
                key={s.id}
                style={{ transitionDelay: `${i * 80}ms` }}
                className={[
                  "transition-all duration-500 ease-out",
                  listReady
                    ? "opacity-100 translate-y-0 blur-0"
                    : "opacity-0 translate-y-12 blur-[8px]",
                ].join(" ")}
              >
                <SeriesCard
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
                    hapticImpact("light");
                    setActiveSeriesId(s.id);
                    setSheetOpen(true);
                  }}
                  completed={completed}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0">
        <div className="mx-auto max-w-[420px] px-5 pt-3 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)]">
          <Link
            href="/add"
            className="block"
            onClick={() => hapticImpact("light")}
          >
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
