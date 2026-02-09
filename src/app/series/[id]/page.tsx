"use client";

import { useEffect, useRef, useState } from "react";

type Season = {
  id: string;
  number: number;
  episodesCount: number;
};

type Episode = {
  id: string;
  number: number;
  watched: boolean;
};

export default function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const [seriesId, setSeriesId] = useState<string | null>(null);

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const episodesReq = useRef(0);

  useEffect(() => {
    params.then(({ id }) => {
      setSeriesId(id);
      loadSeasons(id);
    });
  }, [params]);

  async function loadSeasons(id: string) {
    setLoadingSeasons(true);
    const res = await fetch(`/api/series/${id}/seasons`);
    const data = (await res.json()) as Season[];
    setSeasons(data);
    setLoadingSeasons(false);
  }

  useEffect(() => {
    if (!selectedSeasonId && seasons.length > 0) {
      const firstId = seasons[0].id;
      setSelectedSeasonId(firstId);
      loadEpisodes(firstId);
    }
  }, [seasons, selectedSeasonId]);  

  async function loadEpisodes(seasonId: string) {
    const reqId = ++episodesReq.current;
  
    setLoadingEpisodes(true);
    setEpisodes([]);
  
    const res = await fetch(`/api/seasons/${seasonId}/episodes`);
    const data = (await res.json()) as Episode[];
  
    if (reqId !== episodesReq.current) return;
  
    setEpisodes(data);
    setLoadingEpisodes(false);
  }
  

  async function addSeason() {
    if (!seriesId) return;

    const episodesCount = Number(prompt("Количество серий в сезоне"));
    if (!Number.isInteger(episodesCount) || episodesCount <= 0) return;

    const res = await fetch(`/api/series/${seriesId}/seasons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodesCount }),
    });

    if (!res.ok) {
      alert(`POST failed (${res.status})\n${await res.text()}`);
      return;
    }

    await loadSeasons(seriesId);
  }

  async function toggleEpisode(episodeId: string) {
    const res = await fetch(`/api/episodes/${episodeId}`, { method: "PATCH" });
    if (!res.ok) {
      alert(`PATCH failed (${res.status})\n${await res.text()}`);
      return;
    }

    // простое обновление: перезагрузить эпизоды выбранного сезона
    if (selectedSeasonId) {
      await loadEpisodes(selectedSeasonId);
    }
  }

  if (loadingSeasons) {
    return <main style={{ padding: 16 }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Seasons</h1>
        <button onClick={addSeason}>+ Season</button>
      </div>

      {/* сезоны */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {seasons.map((s) => {
          const active = s.id === selectedSeasonId;
          return (
            <button
              key={s.id}
              onClick={() => {
                setSelectedSeasonId(s.id);
                loadEpisodes(s.id);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: active ? "#eaeaea" : "#f7f7f7",
                cursor: "pointer",
              }}
            >
              S{s.number} · {s.episodesCount} eps
            </button>
          );
        })}
      </div>

      {/* эпизоды */}
      {selectedSeasonId ? (
        loadingEpisodes ? (
          <div>Loading episodes…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 64px)", gap: 10 }}>
            {episodes.map((e) => (
              <button
                key={e.id}
                onClick={() => toggleEpisode(e.id)}
                style={{
                  height: 56,
                  borderRadius: 14,
                  border: e.watched ? "2px solid #000" : "2px solid #ccc",
                  background: e.watched ? "#000" : "#fff",
                  color: e.watched ? "#fff" : "#000",
                  cursor: "pointer",
                  fontSize: 16,
                }}
                title={`Episode ${e.number}`}
              >
                {e.number}
              </button>
            ))}
          </div>
        )
      ) : (
        <div>Нет сезонов. Нажми “+ Season”.</div>
      )}
    </main>
  );
}
