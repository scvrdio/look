import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export function useSeriesPoster(seriesId: string) {
  const { data } = useSWR<{ posterUrl: string | null }>(
    `/api/series/${seriesId}/poster`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    }
  );

  return data?.posterUrl ?? null;
}
