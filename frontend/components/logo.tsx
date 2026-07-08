import { Mail, Radar, ShieldCheck } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-11 w-11 place-items-center rounded-lg border border-cyan/40 bg-cyan/10 shadow-glow">
        <ShieldCheck className="h-7 w-7 text-cyan" aria-hidden="true" />
        <Mail className="absolute h-4 w-4 text-emerald bottom-2 right-1.5" aria-hidden="true" />
        <Radar className="absolute h-4 w-4 text-amber left-1 top-1 opacity-90" aria-hidden="true" />
      </div>
      {!compact && (
        <div>
          <p className="text-base font-bold tracking-normal text-white">PhishGuard</p>
          <p className="text-xs text-slate-400">Think Before You Click</p>
        </div>
      )}
    </div>
  );
}
