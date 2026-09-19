export type Movie = { id: number; name: string; year: number | null; posterUrl: string | null };
type Document = { id: number; name?: string; alternativeName?: string; year?: number; type?: string; isSeries?: boolean; poster?: { url?: string; previewUrl?: string } };

export const demoMovies: Movie[] = [
  { id: 535341, name: "1+1", year: 2011, posterUrl: null },
  { id: 447301, name: "Начало", year: 2010, posterUrl: null },
];

async function request<T>(path: string): Promise<T> {
  const key = process.env.POISKKINO_API_KEY;
  if (!key) throw new Error("Movie catalog is not configured");
  const response = await fetch(`${process.env.POISKKINO_BASE_URL ?? "https://api.poiskkino.dev"}/v1.4/${path}`, {
    headers: { "X-API-KEY": key }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Movie catalog unavailable (${response.status})`);
  return response.json();
}

function toMovie(doc: Document): Movie | null {
  if (!Number.isSafeInteger(doc.id) || doc.id <= 0 || doc.isSeries || !["movie", "cartoon", "animated-movie"].includes(doc.type ?? "")) return null;
  const name = (doc.name || doc.alternativeName || "").trim();
  if (!name) return null;
  return { id: doc.id, name, year: doc.year ?? null, posterUrl: doc.poster?.url ?? doc.poster?.previewUrl ?? null };
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const data = await request<{ docs?: Document[] }>(`movie/search?query=${encodeURIComponent(query)}&limit=50&page=1`);
  return (data.docs ?? []).map(toMovie).filter((m): m is Movie => m !== null);
}

export async function getMovie(id: number): Promise<Movie> {
  const movie = toMovie(await request<Document>(`movie/${id}`));
  if (!movie) throw new Error("Not a movie");
  return movie;
}
