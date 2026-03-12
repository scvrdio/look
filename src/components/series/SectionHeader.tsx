import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: string;
  titleAction?: ReactNode;
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
};

export function SectionHeader({
  title,
  titleAction,
  action,
  className,
  titleClassName,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 pl-1 pb-1", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <h2 className={cn("ty-h2 text", titleClassName)}>{title}</h2>
        {titleAction ? <div className="shrink-0">{titleAction}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
