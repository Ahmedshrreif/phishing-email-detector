"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OverflowMenu({
  open,
  onToggle,
  children,
  align = "right",
  label = "More actions",
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  align?: "left" | "right";
  label?: string;
}) {
  return (
    <div className="relative">
      <Button className="min-h-9 px-3" variant="secondary" onClick={onToggle} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <div className={cn("absolute z-30 mt-2 w-60 overflow-hidden rounded-md border border-line bg-slate-950 shadow-2xl shadow-black/40", align === "right" ? "right-0" : "left-0")} role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

export function OverflowMenuItem({
  children,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition",
        tone === "danger" ? "text-red-200 hover:bg-red-500/10" : "text-slate-200 hover:bg-white/[0.06]"
      )}
      onClick={onClick}
      role="menuitem"
    >
      {children}
    </button>
  );
}
