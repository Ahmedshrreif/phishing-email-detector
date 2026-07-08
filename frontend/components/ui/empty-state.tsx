import type { ReactNode } from "react";
import { ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-dashed border-line bg-slate-950/35 p-6 text-center", className)}>
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-cyan/25 bg-cyan/10 text-cyan">
        {icon || <ShieldQuestion className="h-5 w-5" />}
      </div>
      <p className="mt-3 font-semibold text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
