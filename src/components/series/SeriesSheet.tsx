"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";
import { SeasonTabs } from "@/components/series/SeasonTabs";
import { EpisodeGrid } from "@/components/series/EpisodeGrid";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";


type SeasonRow = {
    id: string;
    number: number;
    episodesCount: number;
};

type EpisodeRow = {
    id: string;
    number: number;
    watched: boolean;
};

type SeriesSheetProps = {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    seriesId: string | null;
    title: string;
    onChanged?: () => void;
};

export function SeriesSheet({ open, onOpenChange, seriesId, title, onChanged }: SeriesSheetProps) {
    const [seasons, setSeasons] = React.useState<SeasonRow[]>([]);
    const [activeSeasonId, setActiveSeasonId] = React.useState<string | null>(null);
    const [episodes, setEpisodes] = React.useState<EpisodeRow[]>([]);
    const [loadingSeasons, setLoadingSeasons] = React.useState(false);
    const [loadingEpisodes, setLoadingEpisodes] = React.useState(false);

    async function toggleEpisode(id: string) {
        // оптимистично
        setEpisodes((prev) =>
            prev.map((e) => (e.id === id ? { ...e, watched: !e.watched } : e))
        );

        const res = await fetch(`/api/episodes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" } });

        if (!res.ok) {
            setEpisodes((prev) => prev.map((e) => (e.id === id ? { ...e, watched: !e.watched } : e)));
        } else {
            onChanged?.();
        }
    }
    // грузим сезоны при открытии/смене сериала
    React.useEffect(() => {
        if (!open || !seriesId) return;

        (async () => {
            setLoadingSeasons(true);
            try {
                const res = await fetch(`/api/series/${seriesId}/seasons`, { cache: "no-store" });
                const data = (await res.json()) as SeasonRow[];
                setSeasons(data);

                // выбрать первый сезон по умолчанию
                const first = data[0]?.id ?? null;
                setActiveSeasonId(first);
            } finally {
                setLoadingSeasons(false);
            }
        })();
    }, [open, seriesId]);

    // грузим эпизоды при выборе сезона
    React.useEffect(() => {
        if (!open || !activeSeasonId) return;

        (async () => {
            setLoadingEpisodes(true);
            try {
                const res = await fetch(`/api/seasons/${activeSeasonId}/episodes`, { cache: "no-store" });
                const data = (await res.json()) as EpisodeRow[];
                setEpisodes(data);
            } finally {
                setLoadingEpisodes(false);
            }
        })();
    }, [open, activeSeasonId]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="p-0 rounded-t-[24px] border-0 shadow-none h-[65dvh] overflow-hidden"
            >
                <VisuallyHidden>
                    <Dialog.Title>{title || "Сериал"}</Dialog.Title>
                </VisuallyHidden>

                <div className="flex h-full flex-col">
                    {/* Header */}
                    <div className="px-5 pt-5 pb-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="text-[32px] font-bold tracking-tight leading-[1]">
                                {title || ""}
                            </div>

                            <SheetClose asChild>
                                <button
                                    type="button"
                                    className="h-10 w-10 rounded-full text-black/60 text-[32px] inline-flex items-center justify-center"
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            </SheetClose>
                        </div>
                    </div>

                    {/* Body (scroll) */}
                    <div className="flex-1 overflow-y-auto px-5 pb-6">
                        <div className="flex h-full flex-col">
                            {/* сезоны (full-bleed, сверху) */}
                            <div className="-mx-5">
                                <div className="px-5 overflow-x-auto no-scrollbar">
                                    <div className="py-2">
                                        <SeasonTabs
                                            items={seasons.map((s) => ({ id: s.id, number: s.number }))}
                                            activeId={activeSeasonId}
                                            onChange={setActiveSeasonId}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* эпизоды (прилипают к низу) */}
                            <div className="mt-auto pt-6">
                                {loadingEpisodes ? (
                                    <div className="text-black/50">Загрузка эпизодов…</div>
                                ) : (
                                    <EpisodeGrid items={episodes} onToggle={toggleEpisode} />
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </SheetContent>
        </Sheet>
    );

}
