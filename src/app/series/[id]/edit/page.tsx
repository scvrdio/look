"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";

import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/fetcher";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { Trash2 } from "lucide-react";

type SeasonDraft = { number: number; episodesCount: string };
type SeriesEditDTO = {
  id: string;
  title: string;
  seasons: { id: string; number: number; episodesCount: number }[];
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

export default function EditSeriesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading } = useSWR<SeriesEditDTO>(`/api/series/${id}`, fetcher);

  const [title, setTitle] = useState("");
  const [seasons, setSeasons] = useState<SeasonDraft[]>([{ number: 1, episodesCount: "" }]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [wasSubmitted, setWasSubmitted] = useState(false);

  // init form from server once
  useEffect(() => {
    if (!data) return;
    setTitle(data.title ?? "");
    const next = (data.seasons ?? [])
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((s, i) => ({ number: i + 1, episodesCount: String(s.episodesCount ?? "") }));
    setSeasons(next.length ? next : [{ number: 1, episodesCount: "" }]);
  }, [data]);

  const canAddSeason = useMemo(() => seasons.length < 20, [seasons.length]);

  function addSeason() {
    if (!canAddSeason) return;
    hapticImpact("light");
    setSeasons((prev) => [...prev, { number: prev.length + 1, episodesCount: "" }]);
  }

  function removeSeason(index: number) {
    hapticImpact("light");
    setSeasons((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, number: i + 1 }));
    });
  }

  function setSeasonEpisodesCount(index: number, raw: string) {
    const onlyDigits = raw.replace(/\D/g, "");
    setSeasons((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], episodesCount: onlyDigits };
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
    if (!data) return false;
    if (title.trim() !== (data.title ?? "").trim()) return true;

    const server = (data.seasons ?? [])
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((s) => String(s.episodesCount ?? ""));

    const local = seasons.map((s) => s.episodesCount.trim());

    return server.join("|") !== local.join("|");
  }, [data, title, seasons]);

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

  async function handleSubmit() {
    setWasSubmitted(true);
    setFormError(null);

    if (titleError) return;
    if (seasonErrors.some(Boolean)) return;

    hapticImpact("medium");
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        seasons: seasons.map((s) => ({
          number: s.number,
          episodesCount: Number(s.episodesCount),
        })),
      };

      const res = await fetch(`/api/series/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (!res.ok) {
        hapticNotify("error");
        const msg = await readErrorMessage(res);
        setFormError(msg);
        return;
      }
      

      hapticNotify("success");
      router.push("/");
    } catch {
      hapticNotify("error");
      setFormError("Ошибка сети. Попробуйте еще раз.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Удалить сериал? Это действие нельзя отменить.")) return;

    hapticImpact("heavy");
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/series/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        hapticNotify("error");
        const msg = await readErrorMessage(res);
        setFormError(msg);
        return;
      }
      

      hapticNotify("success");
      router.push("/");
    } catch {
      hapticNotify("error");
      setFormError("Ошибка сети. Попробуйте еще раз.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-dvh bg-white">
        <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+56px)]">
          <div className="text-black/40">Загрузка…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto max-w-[420px] px-4 pt-[calc(var(--tg-content-safe-top,0px)+24px)] pb-28">
        {/* без хедера */}

        <div className="mt-2 space-y-6">
          <FormField
            label="Название"
            value={title}
            onChange={setTitle}
            placeholder="Дан Да Дан"
            error={wasSubmitted ? titleError : null}
            disabled={submitting}
          />

          <div className="space-y-4">
            {seasons.map((s, idx) => (
              <FormField
                key={s.number}
                label={`${s.number} сезон`}
                value={s.episodesCount}
                onChange={(v) => setSeasonEpisodesCount(idx, v)}
                inputMode="numeric"
                placeholder="Количество серий"
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

      {/* Bottom fixed actions */}
      <div className="fixed inset-x-0 bottom-0 bg-white">
        <div className="mx-auto max-w-[420px] px-5 pb-[calc(var(--tg-content-safe-bottom,0px)+20px)] pt-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="h-14 w-14 rounded-full bg-red-500 text-white inline-flex items-center justify-center disabled:opacity-40"
              aria-label="Удалить сериал"
              title="Удалить сериал"
            >
              <Trash2 size={22} strokeWidth={2.5} />
            </button>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>

          {formError && <div className="mt-2 text-[12px] text-red-500">{formError}</div>}

          <button
            type="button"
            className="mt-2 text-[12px] text-black/40"
            onClick={() => {
              if (!confirmLeave()) return;
              hapticImpact("light");
              router.push("/");
            }}
          >
            Выйти
          </button>
        </div>
      </div>
    </main>
  );
}
