"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  fullWidth = true,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-[10px]",
        "h-16 px-3 py-2 rounded-full",
        "text-[16px]",
        "ty-btn",
        "transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20",
        fullWidth && "w-full",
        variant === "primary" && "bg-black text-white",
        variant === "secondary" && "bg-[#f2f2f2] text-black",
        className
      )}
    />
  );
}
