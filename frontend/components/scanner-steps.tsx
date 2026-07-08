"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const steps = [
  "Parsing email",
  "Extracting sender information",
  "Inspecting email headers",
  "Scanning links",
  "Evaluating message language",
  "Running machine-learning model",
  "Calculating final threat score",
  "Generating explanation"
];

export function ScannerSteps({ active }: { active: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setIndex((value) => Math.min(steps.length - 1, value + 1)), 520);
    return () => window.clearInterval(id);
  }, [active]);
  if (!active) return null;
  return (
    <div className="rounded-lg border border-cyan/30 bg-cyan/[0.08] p-4">
      <div className="relative mb-4 h-16 overflow-hidden rounded-md border border-line bg-slate-950">
        <div className="absolute inset-x-0 top-0 h-8 animate-scan bg-gradient-to-b from-transparent via-cyan/40 to-transparent" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, idx) => (
          <div key={step} className="flex items-center gap-2 text-sm text-slate-300">
            {idx < index ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <Loader2 className="h-4 w-4 animate-spin text-cyan" />}
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}
