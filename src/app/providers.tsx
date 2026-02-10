// src/app/providers.tsx
"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        keepPreviousData: true,
        dedupingInterval: 10_000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
