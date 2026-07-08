"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { DailyActivityPoint, WeeklyThreatPoint } from "@/lib/chart-analytics";
import { activitySummary, makeCountTicks, plural, weeklyThreatSummary } from "@/lib/chart-analytics";

type ChartPayload<T> = {
  color?: string;
  fill?: string;
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  payload?: T;
};

const CHART_COLORS = {
  axis: "#94a3b8",
  grid: "rgba(148,163,184,.11)",
  cyan: "#22d3ee",
  cyanStrong: "#67e8f9",
  cyanMuted: "rgba(34,211,238,.22)",
  phishing: "#fb7185",
};

export function ActivityBarChart({ data, onRetry, error }: { data: DailyActivityPoint[]; onRetry?: () => void; error?: string }) {
  if (error) {
    return <ChartErrorState onRetry={onRetry} />;
  }

  const total = data.reduce((sum, item) => sum + item.analysisCount, 0);
  if (total === 0) {
    return (
      <ChartEmptyState
        title="No analysis activity in the last 7 days"
        description="Run a new security analysis to begin tracking activity."
        action={<Link href="/analyzer"><Button>New Analysis</Button></Link>}
      />
    );
  }

  const maxValue = Math.max(...data.map((item) => item.analysisCount), 1);
  const ticks = makeCountTicks(maxValue);

  return (
    <div className="rounded-md border border-line bg-slate-950/35 p-4">
      <p className="sr-only">{activitySummary(data)}</p>
      <div className="h-72" role="img" aria-label={activitySummary(data)} tabIndex={0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: -12 }} barCategoryGap="24%" accessibilityLayer>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis
              dataKey="label"
              stroke={CHART_COLORS.axis}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={12}
              tick={(props) => <ActivityXAxisTick {...props} data={data} />}
            />
            <YAxis
              stroke={CHART_COLORS.axis}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]]}
              width={34}
            />
            <Tooltip content={<ActivityTooltip />} cursor={{ fill: "rgba(148,163,184,.08)" }} />
            <Bar dataKey="analysisCount" name="Analyses" radius={[5, 5, 0, 0]} maxBarSize={38}>
              {data.map((item) => (
                <Cell
                  key={item.date}
                  fill={item.isToday ? CHART_COLORS.cyanStrong : CHART_COLORS.cyan}
                  stroke={item.isToday ? "rgba(255,255,255,.52)" : "transparent"}
                  strokeWidth={item.isToday ? 1.5 : 0}
                />
              ))}
              <LabelList
                dataKey="analysisCount"
                position="top"
                fill="#dffaff"
                fontSize={12}
                formatter={(value: unknown) => (Number(value) > 0 ? String(value) : "")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-sm text-slate-500">Daily analysis volume over the last 7 days.</p>
    </div>
  );
}

export function WeeklyThreatChart({ data, onRetry, error }: { data: WeeklyThreatPoint[]; onRetry?: () => void; error?: string }) {
  if (error) {
    return <ChartErrorState onRetry={onRetry} />;
  }

  const total = data.reduce((sum, item) => sum + item.totalAnalyses, 0);
  if (total === 0) {
    return (
      <ChartEmptyState
        title="No report data for this period"
        description="Choose a wider date range or run additional analyses."
        action={<Link href="/analyzer"><Button>New Analysis</Button></Link>}
      />
    );
  }

  const maxValue = Math.max(...data.flatMap((item) => [item.totalAnalyses, item.phishingAnalyses]), 1);
  const ticks = makeCountTicks(maxValue);
  const hasLowVolumeWeeks = data.some((item) => item.isLowVolume);

  return (
    <div className="rounded-md border border-line bg-slate-950/35 p-4">
      <p className="sr-only">{weeklyThreatSummary(data)}</p>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-cyan" /> Total analyses</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-rose-400" /> Phishing analyses</span>
        </div>
        <span className="text-xs text-slate-500">Grouped by reporting week</span>
      </div>
      <div className="overflow-x-auto">
        <div className={data.length <= 2 ? "h-80 min-w-[360px]" : "h-80 min-w-[620px]"} role="img" aria-label={weeklyThreatSummary(data)} tabIndex={0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -12 }} barCategoryGap="22%" barGap={6} accessibilityLayer>
              <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
              <XAxis dataKey="label" stroke={CHART_COLORS.axis} axisLine={false} tickLine={false} tickMargin={10} minTickGap={14} />
              <YAxis
                stroke={CHART_COLORS.axis}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                ticks={ticks}
                domain={[0, ticks[ticks.length - 1]]}
                width={34}
              />
              <Tooltip content={<WeeklyTooltip />} cursor={{ fill: "rgba(148,163,184,.08)" }} />
              <Bar dataKey="totalAnalyses" name="Total analyses" fill={CHART_COLORS.cyan} radius={[5, 5, 0, 0]} maxBarSize={32}>
                {data.map((item) => (
                  <Cell
                    key={`total-${item.periodStart}`}
                    fill={CHART_COLORS.cyan}
                    fillOpacity={item.isPartial ? 0.55 : 1}
                    stroke={item.isPartial ? CHART_COLORS.cyanStrong : "transparent"}
                    strokeDasharray={item.isPartial ? "4 3" : undefined}
                  />
                ))}
              </Bar>
              <Bar dataKey="phishingAnalyses" name="Phishing analyses" fill={CHART_COLORS.phishing} radius={[5, 5, 0, 0]} maxBarSize={32}>
                {data.map((item) => (
                  <Cell
                    key={`phishing-${item.periodStart}`}
                    fill={CHART_COLORS.phishing}
                    fillOpacity={item.isPartial ? 0.58 : 1}
                    stroke={item.isPartial ? "#fecdd3" : "transparent"}
                    strokeDasharray={item.isPartial ? "4 3" : undefined}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {hasLowVolumeWeeks && (
        <p className="mt-3 rounded-md border border-amber/25 bg-amber/10 p-3 text-sm text-amber-100">
          Phishing rates may fluctuate significantly when analysis volume is low.
        </p>
      )}
    </div>
  );
}

export function ChartSkeleton({ className = "h-80" }: { className?: string }) {
  return (
    <div className={`rounded-md border border-line bg-slate-950/35 p-4 ${className}`}>
      <div className="h-full animate-pulse rounded-md bg-white/[0.05]" />
    </div>
  );
}

export function ChartEmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <EmptyState icon={<BarChart3 className="h-5 w-5" />} title={title} description={description} action={action} className="min-h-72" />;
}

export function ChartErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-5 w-5" />}
      title="Unable to load chart data"
      description="Your analysis records are still available. Retry loading the visualization."
      action={onRetry ? <Button variant="secondary" onClick={onRetry}>Retry</Button> : undefined}
      className="min-h-72 border-amber/30"
    />
  );
}

function ActivityTooltip({ active, payload }: { active?: boolean; payload?: Array<ChartPayload<DailyActivityPoint>> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point) return null;
  return (
    <div className="rounded-md border border-line bg-slate-950/95 p-3 text-sm shadow-xl shadow-black/30">
      <p className="font-semibold text-white">{point.label}{point.isToday ? " (Today)" : ""}</p>
      <p className="mt-1 text-slate-300">{point.analysisCount} {plural(point.analysisCount, "analysis", "analyses")}</p>
    </div>
  );
}

function ActivityXAxisTick({
  x,
  y,
  payload,
  data,
}: {
  x?: string | number;
  y?: string | number;
  payload?: { value?: string; index?: number };
  data: DailyActivityPoint[];
}) {
  const point = typeof payload?.index === "number" ? data[payload.index] : data.find((item) => item.label === payload?.value);
  const tickX = typeof x === "number" ? x : Number(x || 0);
  const tickY = typeof y === "number" ? y : Number(y || 0);
  return (
    <g transform={`translate(${tickX},${tickY})`}>
      <text textAnchor="middle" fill={CHART_COLORS.axis} fontSize={12}>
        <tspan x="0" dy="0">{payload?.value}</tspan>
        {point?.isToday && <tspan x="0" dy="14" fill={CHART_COLORS.cyanStrong} fontSize={11}>Today</tspan>}
      </text>
    </g>
  );
}

function WeeklyTooltip({ active, payload }: { active?: boolean; payload?: Array<ChartPayload<WeeklyThreatPoint>> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point) return null;
  return (
    <div className="max-w-xs rounded-md border border-line bg-slate-950/95 p-3 text-sm shadow-xl shadow-black/30">
      <p className="mb-2 font-semibold text-white">{point.label}</p>
      <p className="text-slate-300">Total analyses: <span className="font-bold text-white">{point.totalAnalyses} {plural(point.totalAnalyses, "analysis", "analyses")}</span></p>
      <p className="text-slate-300">Phishing analyses: <span className="font-bold text-white">{point.phishingAnalyses} {plural(point.phishingAnalyses, "analysis", "analyses")}</span></p>
      <p className="text-slate-300">Phishing rate: <span className="font-bold text-white">{point.phishingRate === null ? "No data" : `${point.phishingRate.toFixed(1)}%`}</span></p>
      {point.totalAnalyses === 0 && <p className="mt-2 text-slate-400">No analyses yet.</p>}
      {point.isPartial && <p className="mt-2 text-cyan">This reporting week is still in progress.</p>}
      {point.isLowVolume && <p className="mt-2 text-amber-100">Rate may be volatile because this week contains fewer than 5 analyses.</p>}
    </div>
  );
}
