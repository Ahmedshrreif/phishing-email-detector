import type { AnalysisListItem } from "@/types/api";

const DAY_MS = 86_400_000;
const LOW_VOLUME_THRESHOLD = 5;

export type DailyActivityPoint = {
  date: string;
  label: string;
  analysisCount: number;
  isToday: boolean;
};

export type WeeklyThreatPoint = {
  periodStart: string;
  periodEnd: string;
  label: string;
  totalAnalyses: number;
  phishingAnalyses: number;
  phishingRate: number | null;
  isLowVolume: boolean;
  isPartial: boolean;
};

export type DateRangeLike = {
  from?: string;
  to?: string;
};

export function buildSevenDayActivity(
  trend: Array<{ date: string; count: number }>,
  referenceDate = new Date()
): DailyActivityPoint[] {
  const counts = new Map<string, number>();
  trend.forEach((item) => {
    const key = dateKey(item.date);
    counts.set(key, (counts.get(key) || 0) + Number(item.count || 0));
  });

  const today = startOfDay(referenceDate);
  const firstDay = addDays(today, -6);
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(firstDay, index);
    const key = dateKey(date);
    return {
      date: key,
      label: formatCompactDate(date),
      analysisCount: counts.get(key) || 0,
      isToday: key === dateKey(today),
    };
  });
}

export function activitySummary(points: DailyActivityPoint[]) {
  const total = points.reduce((sum, item) => sum + item.analysisCount, 0);
  const peak = points.reduce((best, item) => (item.analysisCount > best.analysisCount ? item : best), points[0]);
  if (!total) return "Seven-day activity: no analyses were created in the last 7 days.";
  return `Seven-day activity: ${total} ${plural(total, "analysis", "analyses")} total. The highest activity was ${peak.label} with ${peak.analysisCount} ${plural(peak.analysisCount, "analysis", "analyses")}.`;
}

export function buildWeeklyThreatData(rows: AnalysisListItem[], range: DateRangeLike): WeeklyThreatPoint[] {
  const bounds = reportingBounds(rows, range);
  if (!bounds) return [];

  const buckets: WeeklyThreatPoint[] = [];
  let cursor = startOfDay(bounds.from);
  const end = startOfDay(bounds.to);
  while (cursor <= end) {
    const periodStartDate = new Date(cursor);
    const periodEndDate = minDate(addDays(periodStartDate, 6), end);
    const isPartial = daysBetween(periodStartDate, periodEndDate) < 6;
    buckets.push({
      periodStart: dateKey(periodStartDate),
      periodEnd: dateKey(periodEndDate),
      label: formatWeekLabel(periodStartDate, periodEndDate, isPartial),
      totalAnalyses: 0,
      phishingAnalyses: 0,
      phishingRate: null,
      isLowVolume: false,
      isPartial,
    });
    cursor = addDays(periodEndDate, 1);
  }

  rows.forEach((row) => {
    const date = parseDate(row.created_at);
    if (!date) return;
    const key = startOfDay(date).getTime();
    const bucket = buckets.find((item) => key >= parseDate(item.periodStart)!.getTime() && key <= parseDate(item.periodEnd)!.getTime());
    if (!bucket) return;
    bucket.totalAnalyses += 1;
    if (isPhishingAnalysis(row)) bucket.phishingAnalyses += 1;
  });

  return buckets.map((bucket) => ({
    ...bucket,
    phishingRate: bucket.totalAnalyses ? roundRate((bucket.phishingAnalyses / bucket.totalAnalyses) * 100) : null,
    isLowVolume: bucket.totalAnalyses > 0 && bucket.totalAnalyses < LOW_VOLUME_THRESHOLD,
  }));
}

export function weeklyThreatSummary(points: WeeklyThreatPoint[]) {
  const total = points.reduce((sum, item) => sum + item.totalAnalyses, 0);
  const phishing = points.reduce((sum, item) => sum + item.phishingAnalyses, 0);
  const peak = peakWeek(points);
  if (!total) return "Weekly report chart: no analyses are available for the selected period.";
  return `Weekly report chart: ${total} ${plural(total, "analysis", "analyses")} and ${phishing} phishing ${plural(phishing, "analysis", "analyses")} across ${points.length} ${plural(points.length, "week", "weeks")}. Peak week was ${peak?.label || "not available"}.`;
}

export function peakWeek(points: WeeklyThreatPoint[]) {
  if (!points.length) return null;
  return points.reduce((best, item) => (item.totalAnalyses > best.totalAnalyses ? item : best), points[0]);
}

export function phishingCount(rows: AnalysisListItem[]) {
  return rows.filter(isPhishingAnalysis).length;
}

export function phishingRateForRows(rows: AnalysisListItem[]) {
  if (!rows.length) return null;
  return roundRate((phishingCount(rows) / rows.length) * 100);
}

export function formatRate(value: number | null) {
  return value === null ? "No data" : `${value.toFixed(1)}%`;
}

export function plural(count: number, singular: string, pluralValue: string) {
  return count === 1 ? singular : pluralValue;
}

export function makeCountTicks(maxValue: number) {
  if (maxValue <= 1) return [0, 1];
  const rawStep = maxValue / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / power;
  const step = Math.max(1, (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power);
  const top = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(Math.round(value));
  return ticks;
}

export function chartDateKey(value: string | Date) {
  return dateKey(value);
}

export function formatCompactDate(value: string | Date) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return String(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function reportingBounds(rows: AnalysisListItem[], range: DateRangeLike) {
  const from = range.from ? parseDate(range.from) : null;
  const to = range.to ? parseDate(range.to) : null;
  if (from && to && from <= to) return { from, to };
  const dates = rows.map((row) => parseDate(row.created_at)).filter((date): date is Date => Boolean(date));
  if (!dates.length) return null;
  dates.sort((a, b) => a.getTime() - b.getTime());
  return { from: dates[0], to: dates[dates.length - 1] };
}

function isPhishingAnalysis(row: AnalysisListItem) {
  return row.classification === "phishing";
}

function roundRate(value: number) {
  return Math.round(value * 10) / 10;
}

function formatWeekLabel(from: Date, to: Date, isPartial: boolean) {
  const fromMonth = new Intl.DateTimeFormat(undefined, { month: "short" }).format(from);
  const toMonth = new Intl.DateTimeFormat(undefined, { month: "short" }).format(to);
  const fromDay = new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(from);
  const toDay = new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(to);
  const label = dateKey(from) === dateKey(to)
    ? `${fromMonth} ${fromDay}`
    : fromMonth === toMonth
      ? `${fromMonth} ${fromDay}-${toDay}`
      : `${fromMonth} ${fromDay}-${toMonth} ${toDay}`;
  return isPartial ? `${label} · Partial Week` : label;
}

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return String(value).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function minDate(a: Date, b: Date) {
  return a <= b ? a : b;
}

function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}
