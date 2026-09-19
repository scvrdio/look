"use client";

import { useState } from "react";
import { mutate } from "swr";
import { Dialog } from "radix-ui";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { XCircleFill, TrashFill, PlaylistCheckFill } from "@/icons";
import { hapticNotify } from "@/lib/haptics";
import { KinopoiskButton } from "./KinopoiskButton";
import { SheetActionBar } from "./SheetActionBar";

export function MovieSheet({ open, onOpenChange, seriesId, title, progressPercent = 0, onChanged, onProgressStarted }: {
  open: boolean; onOpenChange: (open: boolean) => void; seriesId: string | null; title: string;
  progressPercent?: number; onChanged?: () => void; onProgressStarted?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const watched = progressPercent === 100;

  async function update(remove = false) {
    if (busy || !seriesId) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/series/${seriesId}`, {
        method: remove ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
        body: remove ? undefined : JSON.stringify({ completed: !watched }),
      });
      if (!response.ok) throw new Error("Movie update failed");
      await mutate("/api/series");
      onChanged?.();
      if (!remove && !watched) onProgressStarted?.();
      hapticNotify("success");
      onOpenChange(false);
    } catch {
      setError("Не удалось сохранить изменения. Попробуй ещё раз.");
      hapticNotify("error");
    } finally { setBusy(false); }
  }

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="rounded-t-[32px] border-0 shadow-none px-5 pb-8 pt-6" onOpenAutoFocus={event => event.preventDefault()}>
      <div className="flex items-center justify-between gap-3">
        <Dialog.Title className="ty-h1-sheet truncate">{title}</Dialog.Title>
        <SheetClose asChild><button aria-label="Закрыть" className="shrink-0"><XCircleFill className="h-7 w-7" /></button></SheetClose>
      </div>
      <Dialog.Description className="mt-2 ty-body-14 text-black/50">Фильм · {watched ? "Просмотрен" : "Буду смотреть"}</Dialog.Description>
      <div className="mt-8 pb-[var(--tg-content-safe-bottom,0px)]">
        <SheetActionBar>
          <button disabled={busy} onClick={() => setConfirmDelete(true)} aria-label="Удалить фильм" title="Удалить фильм" className="inline-flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40">
            <TrashFill className="h-7 w-7 text-[#FF0000]" />
          </button>
          <button disabled={busy} onClick={() => void update()} aria-label={watched ? "Отметить непросмотренным" : "Отметить просмотренным"} title={watched ? "Отметить непросмотренным" : "Отметить просмотренным"} aria-pressed={watched} className="inline-flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40">
            <PlaylistCheckFill className={`h-7 w-7 ${watched ? "text-[#00A900]" : "text-black"}`} />
          </button>
          {seriesId ? <KinopoiskButton seriesId={seriesId} title={title} active={open} /> : null}
        </SheetActionBar>
      </div>
      {confirmDelete ? <div className="mt-4">
        <p className="ty-body-14">Удалить фильм из списка?</p>
        <div className="mt-3 flex gap-3">
          <button disabled={busy} onClick={() => setConfirmDelete(false)} className="h-11 flex-1 rounded-full bg-black/5">Отмена</button>
          <button disabled={busy} onClick={() => void update(true)} className="h-11 flex-1 rounded-full bg-red-500 text-white">Удалить</button>
        </div>
      </div> : null}
      {error ? <p role="alert" className="mt-3 ty-body-14 text-red-500">{error}</p> : null}
    </SheetContent>
  </Sheet>;
}
