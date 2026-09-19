import type { ReactNode } from "react";

export function SheetActionBar({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-fit max-w-[calc(100vw-40px)] items-center gap-[clamp(16px,calc((100vw-248px)/3),40px)] rounded-full bg-white px-4 py-2 shadow-[0_0_16.3px_0_rgba(0,0,0,0.05)]">
    {children}
  </div>;
}
