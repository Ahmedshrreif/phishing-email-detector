import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, securityLabel } from "@/lib/utils";

export function StatusChip({ value, icon }: { value: string; icon?: ReactNode }) {
  const normalized = value.toLowerCase();
  const state =
    ["ok", "operational", "ready", "available", "connected", "recorded", "pass", "approved", "active"].includes(normalized)
      ? "good"
      : ["degraded", "warning", "pending", "not_configured", "not configured", "neutral"].includes(normalized)
        ? "warn"
        : ["unavailable", "failed", "fail", "blocked", "rejected", "invalid", "suspended"].includes(normalized)
          ? "bad"
          : "neutral";
  const Icon = state === "good" ? CheckCircle2 : state === "bad" ? XCircle : state === "warn" ? AlertTriangle : CircleDashed;
  return (
    <Badge
      className={cn(
        "gap-1.5",
        state === "good" && "border-emerald/40 text-emerald",
        state === "warn" && "border-amber/40 text-amber",
        state === "bad" && "border-rose-400/40 text-rose-200",
        state === "neutral" && "text-slate-300"
      )}
    >
      {icon || <Icon className="h-3.5 w-3.5" />}
      {securityLabel(value)}
    </Badge>
  );
}
