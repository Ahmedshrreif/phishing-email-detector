import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-cyan text-slate-950 hover:bg-sky-300",
        variant === "secondary" && "border border-line bg-white/[0.07] text-slate-100 hover:bg-white/[0.12]",
        variant === "danger" && "bg-rose-500 text-white hover:bg-rose-400",
        variant === "ghost" && "text-slate-200 hover:bg-white/[0.08]",
        className
      )}
      {...props}
    />
  );
}
