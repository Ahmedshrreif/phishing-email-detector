import * as React from "react";
import { cn } from "@/lib/utils";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-md border border-line bg-slate-950/70 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-slate-500/60 focus:border-cyan/80 focus:ring-2 focus:ring-cyan/20",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-32 w-full rounded-md border border-line bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-slate-500/60 focus:border-cyan/80 focus:ring-2 focus:ring-cyan/20",
        props.className
      )}
    />
  );
}
