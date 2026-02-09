"use client";

import { FormField } from "@/components/ui/form-field";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type SeasonDraft = {
    number: number;
    episodesCount: string; // строка, чтобы нормально жить с пустым вводом
};

export default function AddSeriesPage() {

    const router = useRouter();

    const [title, setTitle] = useState("");
    const [seasons, setSeasons] = useState<SeasonDraft[]>([
        { number: 1, episodesCount: "" },
    ]);

    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [wasSubmitted, setWasSubmitted] = useState(false);

    const canAddSeason = useMemo(() => seasons.length < 20, [seasons.length]);


    function addSeason() {
        if (!canAddSeason) return;
        setSeasons((prev) => [
            ...prev,
            { number: prev.length + 1, episodesCount: "" },
        ]);
    }

    function removeSeason(index: number) {
        setSeasons((prev) => {
            if (prev.length <= 1) return prev; // минимум 1 сезон
            const next = prev.filter((_, i) => i !== index);
            // перенумеровываем 1..N
            return next.map((s, i) => ({ ...s, number: i + 1 }));
        });
    }

    function setSeasonEpisodesCount(index: number, raw: string) {
        // оставляем только цифры (чтобы не было мусора)
        const onlyDigits = raw.replace(/\D/g, "");
        setSeasons((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], episodesCount: onlyDigits };
            return next;
        });
    }

    const MAX_EPISODES = 25;

    function normalizeEpisodesCount(raw: string) {
        const digits = raw.replace(/\D/g, "");
        if (!digits) return "";

        // убираем ведущие нули: "007" -> "7"
        const n = Number(digits);

        if (!Number.isFinite(n)) return "";
        if (n <= 0) return "1";
        if (n > MAX_EPISODES) return String(MAX_EPISODES);
        return String(Math.trunc(n));
    }

    function onSeasonBlur(index: number) {
        setSeasons((prev) => {
            const next = [...prev];
            next[index] = {
                ...next[index],
                episodesCount: normalizeEpisodesCount(next[index].episodesCount),
            };
            return next;
        });
    }


    const titleError = title.trim().length === 0 ? "Введите название" : null;

    const seasonErrors = useMemo(() => {
        return seasons.map((s) => {
            const v = s.episodesCount.trim();
            if (!v) return "Укажите количество серий";
            const n = Number(v);
            if (!Number.isInteger(n) || n <= 0) return "Нужно целое число больше 0";
            if (n > 200) return "Слишком много серий для сезона";
            return null;
        });
    }, [seasons]);

    const canSubmit = !submitting && !titleError && seasonErrors.every((e) => !e);

    const isDirty = useMemo(() => {
        if (title.trim().length > 0) return true;
        return seasons.some((s) => s.episodesCount.trim() !== "");
    }, [title, seasons]);


    async function handleSubmit() {
        setWasSubmitted(true);
        setFormError(null);

        if (titleError) return;
        if (seasonErrors.some(Boolean)) return;

        setSubmitting(true);
        try {
            const payload = {
                title: title.trim(),
                seasons: seasons.map((s) => ({
                    number: s.number,
                    episodesCount: Number(s.episodesCount),
                })),
            };

            const res = await fetch("/api/series", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                // если сервер возвращает { message }, покажем её; иначе — дефолт
                let msg = "Не удалось сохранить";
                try {
                    const data = await res.json();
                    if (data?.message) msg = String(data.message);
                } catch { }
                setFormError(msg);
                return;
            }

            router.push("/");
        } catch {
            setFormError("Ошибка сети. Попробуйте еще раз.");
        } finally {
            setSubmitting(false);
        }
    }

    function confirmLeave() {
        if (!isDirty) return true;
        return window.confirm("Есть несохранённые изменения. Выйти без сохранения?");
    }

    useEffect(() => {
        if (!isDirty) return;

        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };

        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [isDirty]);

    return (
        <main className="min-h-dvh bg-white">
            <div className="mx-auto max-w-[420px] px-5 pt-6 pb-28">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <h1 className="text-[32px] ty-h1">Добавить сериал</h1>

                    <button
                        type="button"
                        onClick={() => {
                            if (!confirmLeave()) return;
                            router.push("/");
                        }}
                        className="h-10 w-10 rounded-full text-black/60 text-[32px] inline-flex items-center justify-center"
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Form */}
                <div className="mt-6 space-y-6">
                    {/* Title */}
                    <FormField
                        label="Название"
                        value={title}
                        onChange={setTitle}
                        placeholder="Дан Да Дан"
                        error={wasSubmitted ? titleError : null}
                        disabled={submitting}
                    />



                    {/* Seasons */}
                    <div className="space-y-4">
                        {seasons.map((s, idx) => (
                            <FormField
                                key={s.number}
                                label={`${s.number} сезон`}
                                value={s.episodesCount}
                                onChange={(v) => setSeasonEpisodesCount(idx, v)}
                                inputMode="numeric"
                                placeholder="Количество"
                                error={wasSubmitted ? seasonErrors[idx] : null}
                                disabled={submitting}
                                labelRight={
                                    s.number === 1 ? null : (
                                        <button
                                            type="button"
                                            onClick={() => removeSeason(idx)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F2F2F2] text-[24px] font-regular opacity-30 leading-none"
                                            aria-label="Удалить сезон"
                                        >
                                            ×
                                        </button>
                                    )
                                }
                                dataName={`season-${idx}`}
                                onBlur={() => onSeasonBlur(idx)}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter") return;
                                    e.preventDefault();

                                    const next = document.querySelector<HTMLInputElement>(
                                        `[data-name="season-${idx + 1}"]`
                                    );

                                    if (next) next.focus();
                                    else {
                                        const save = document.querySelector<HTMLButtonElement>(
                                            `[data-name="save-button"]`
                                        );
                                        save?.focus();
                                    }
                                }}
                            />
                        ))}

                        <button
                            type="button"
                            onClick={addSeason}
                            disabled={!canAddSeason || submitting}
                            className="h-11 w-full rounded-full bg-[#F2F2F2] text-[14px] font-medium disabled:opacity-40"
                        >
                            Добавить сезон
                        </button>
                    </div>

                </div>
            </div>

            {/* Bottom fixed save */}
            <div className="fixed inset-x-0 bottom-0 bg-white">
                <div className="mx-auto max-w-[420px] px-5 pb-5 pt-3">
                    <Button type="button" onClick={handleSubmit} disabled={!canSubmit} data-name="save-button">
                        {submitting ? "Сохранение..." : "Сохранить"}
                    </Button>

                    {formError && (
                        <div className="mt-2 text-[12px] text-red-500">{formError}</div>
                    )}
                </div>
            </div>
        </main>
    );
}
