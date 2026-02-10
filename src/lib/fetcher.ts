// src/lib/fetcher.ts
export async function fetcher<T>(url: string): Promise<T> {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
  