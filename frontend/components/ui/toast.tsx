"use client";

import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TOAST_EVENT, type ToastPayload } from "@/lib/toast";

type ToastItem = ToastPayload & {
  id: number;
};

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      const id = Date.now() + Math.random();
      const item: ToastItem = { id, tone: detail.tone ?? "info", title: detail.title, description: detail.description };
      setItems((current) => [...current, item].slice(-4));
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 4200);
    }
    window.addEventListener(TOAST_EVENT, handle);
    return () => window.removeEventListener(TOAST_EVENT, handle);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] grid w-[min(92vw,380px)] gap-3" aria-live="polite" aria-relevant="additions">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={() => setItems((current) => current.filter((toast) => toast.id !== item.id))} />
      ))}
    </div>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" ? XCircle : Info;
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={cn(
        "w-full rounded-md border bg-slate-950/95 p-4 text-left shadow-2xl shadow-black/35 backdrop-blur transition hover:border-cyan/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan",
        item.tone === "success" && "border-emerald/35",
        item.tone === "error" && "border-rose-400/35",
        item.tone === "info" && "border-cyan/30"
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            item.tone === "success" && "text-emerald",
            item.tone === "error" && "text-rose-300",
            item.tone === "info" && "text-cyan"
          )}
        />
        <div className="min-w-0">
          <p className="font-semibold text-white">{item.title}</p>
          {item.description && <p className="mt-1 text-sm leading-5 text-slate-400">{item.description}</p>}
        </div>
      </div>
    </button>
  );
}
