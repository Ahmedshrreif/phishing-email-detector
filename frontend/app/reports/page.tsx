"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, FileJson, FileText, RotateCcw, ShieldAlert, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChartSkeleton, WeeklyThreatChart } from "@/components/charts/security-charts";
import { OverflowMenu, OverflowMenuItem } from "@/components/ui/overflow-menu";
import { api, apiErrorMessage, client, currentUser } from "@/services/api";
import type { Analysis, AnalysisListItem, Feedback } from "@/types/api";
import { buildWeeklyThreatData, formatRate, peakWeek, phishingCount, phishingRateForRows, plural } from "@/lib/chart-analytics";
import { showToast } from "@/lib/toast";
import { cn, downloadBlob, formatReadableDateTime, riskColor, securityLabel, textDirectionClass } from "@/lib/utils";

const RESULT_BUCKETS = ["safe", "suspicious", "phishing", "critical"] as const;

type DateRange = {
  from?: string;
  to?: string;
};

export default function ReportsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AnalysisListItem[]>([]);
  const [previousRows, setPreviousRows] = useState<AnalysisListItem[]>([]);
  const [details, setDetails] = useState<Analysis[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [period, setPeriod] = useState("30");
  const [range, setRange] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, range.from, range.to]);

  const currentRange = useMemo(() => dateRangeForPeriod(period, range), [period, range]);
  const previousRange = useMemo(() => previousDateRangeFor(currentRange), [currentRange]);
  const summary = useMemo(() => buildReportSummary(rows, previousRows, details, feedback, currentRange), [rows, previousRows, details, feedback, currentRange]);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const currentParams = paramsForRange(currentRange);
      const previousParams = paramsForRange(previousRange);
      const [list, previousList, feedbackList] = await Promise.all([
        client.analyses(currentParams),
        previousParams ? client.analyses(previousParams) : Promise.resolve([]),
        loadFeedback(),
      ]);
      setRows(list);
      setPreviousRows(previousList);
      setFeedback(feedbackList);
      const settled = await Promise.allSettled(list.slice(0, 75).map((item) => client.analysis(item.id)));
      setDetails(settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : [])));
    } catch (error: unknown) {
      setRows([]);
      setPreviousRows([]);
      setDetails([]);
      setFeedback([]);
      setMessage(apiErrorMessage(error, "Reports are unavailable. Check the API service and reload this page."));
    } finally {
      setLoading(false);
    }
  }

  async function loadFeedback() {
    try {
      return currentUser()?.role === "admin" ? await client.adminFeedback() : await client.myFeedback();
    } catch {
      return [];
    }
  }

  async function download(id: string, format: "pdf" | "json") {
    setMenuOpenId(null);
    try {
      const response = await api.get(`/api/analyses/${id}/report`, { params: { format }, responseType: format === "pdf" ? "blob" : "text" });
      downloadBlob(response.data, `phishguard-${id}.${format}`, format === "pdf" ? "application/pdf" : "application/json");
      showToast({ title: format === "pdf" ? "PDF report downloaded" : "JSON export downloaded", tone: "success" });
    } catch (error: unknown) {
      const text = apiErrorMessage(error, `${format.toUpperCase()} export failed.`);
      setMessage(text);
      showToast({ title: `${format.toUpperCase()} export failed`, description: text, tone: "error" });
    }
  }

  async function reanalyze(item: AnalysisListItem) {
    setMenuOpenId(null);
    setMessage("Re-analyzing the saved evidence...");
    try {
      const detail = await client.analysis(item.id);
      const result =
        item.analysis_source === "url" && detail.urls.length
          ? await client.analyzeUrl(detail.urls.map((url) => url.original_url))
          : await client.analyzeEmail({
              sender_email: textValue(detail.sender_analysis.sender_address || item.sender),
              reply_to: textValue(detail.sender_analysis.reply_to_address),
              subject: item.subject || "Re-analysis",
              body: htmlToText(detail.sanitized_preview) || detail.summary,
              urls: detail.urls.map((url) => url.original_url),
            });
      router.push(`/analyses/${result.analysis_id}`);
    } catch (error: unknown) {
      setMessage(apiErrorMessage(error, "Re-analysis failed. Open the report details and run a fresh analysis from the Analyzer page."));
    }
  }

  function exportReportCsv() {
    const lines = [
      ["Section", "Metric", "Value"],
      ["Summary", "Analyses", summary.total],
      ["Summary", "Phishing Analyses", summary.phishing],
      ["Summary", "Phishing Rate", formatRate(summary.phishingRate)],
      ["Summary", "Change vs Previous Period", summary.changeLabel],
      ["Summary", "High-Risk Analyses", summary.highRisk],
      ["Summary", "False Positive Rate", formatRate(summary.falsePositiveRate)],
      [],
      ["Weekly Analysis Volume and Phishing Results"],
      ["Week", "Total Analyses", "Phishing Analyses", "Phishing Rate"],
      ...summary.weeklyThreatData.map((item) => [item.label, item.totalAnalyses, item.phishingAnalyses, formatRate(item.phishingRate)]),
      [],
      ["Current Period vs Previous Period"],
      ["Result", "Current Period", "Previous Period", "Change"],
      ...summary.comparison.map((item) => [item.label, item.current, item.previous, item.changeLabel]),
      [],
      ["Most Targeted Domains"],
      ["Domain", "Count", "Average Risk", "Max Risk"],
      ...summary.topDomains.map((item) => [item.domain, item.count, item.averageRisk.toFixed(1), item.maxRisk.toFixed(1)]),
      [],
      ["Highest Average-Risk Domains"],
      ["Domain", "Count", "Average Risk", "Max Risk"],
      ...summary.highestRiskDomains.map((item) => [item.domain, item.count, item.averageRisk.toFixed(1), item.maxRisk.toFixed(1)]),
      [],
      ["Top Threat Indicators"],
      ["Indicator", "Count"],
      ...summary.topIndicators.map((item) => [securityLabel(item.name), item.count]),
      [],
      ["Detailed Table"],
      ["Date", "Source", "Result", "Risk Score", "Sender", "Subject"],
      ...rows.map((item) => [formatReadableDateTime(item.created_at), securityLabel(item.analysis_source), securityLabel(bucketFor(item.classification)), Math.round(item.risk_score), item.sender || "Unknown sender", item.subject || "Untitled analysis"]),
    ];
    downloadBlob(lines.map((row) => row.map(csvCell).join(",")).join("\n"), "phishguard-period-report.csv", "text/csv");
    showToast({ title: "Report CSV exported", tone: "success" });
  }

  function exportPdf() {
    window.print();
    showToast({ title: "Print dialog opened", description: "Use Save as PDF to export the report.", tone: "info" });
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-black text-white">Reports</h1>
          <p className="mt-2 text-slate-400">Analyze a selected period, compare it with the previous period, and export evidence-backed results.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportReportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          <Button onClick={exportPdf}><FileText className="h-4 w-4" /> Export PDF</Button>
        </div>
      </div>

      <Card className="mb-5 print:hidden">
        <div className="grid gap-3 lg:grid-cols-[.8fr_.8fr_.8fr_1fr]">
          <Select label="Report period" value={period} onChange={setPeriod} options={["7", "30", "this_month", "previous_month", "custom"]} />
          <label className="relative">
            <CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input className="pl-9" type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} aria-label="Date from" disabled={period !== "custom"} />
          </label>
          <label className="relative">
            <CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input className="pl-9" type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} aria-label="Date to" disabled={period !== "custom"} />
          </label>
          <Button variant="secondary" onClick={load}><TrendingUp className="h-4 w-4" /> Apply Filters</Button>
        </div>
      </Card>

      {message && <Card className="mb-5 border-amber/40 text-amber-100">{message}</Card>}
      {loading && <ReportsSkeleton />}

      {!loading && rows.length === 0 && message && (
        <Card>
          <h2 className="mb-4 text-xl font-bold text-white">Weekly Analysis Volume and Phishing Results</h2>
          <WeeklyThreatChart data={[]} error={message} onRetry={load} />
        </Card>
      )}

      {!loading && rows.length === 0 && !message && (
        <Card className="border-cyan/30 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-cyan" />
          <h2 className="mt-4 text-xl font-bold text-white">No report data for this period</h2>
          <p className="mt-2 text-sm text-slate-400">Choose a wider date range or run additional analyses.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => { setPeriod("30"); setRange({ from: "", to: "" }); }}>Change Date Range</Button>
            <Link href="/analyzer"><Button>New Analysis</Button></Link>
          </div>
        </Card>
      )}

      {!loading && rows.length > 0 && (
        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Stat label="Analyses" value={summary.total} />
            <Stat label="Phishing Rate" value={formatRate(summary.phishingRate)} tone={rateTone(summary.phishingRate)} />
            <Stat label="Change vs Previous Period" value={summary.changeLabel} tone={summary.changeTone} />
            <Stat label="High-Risk Analyses" value={summary.highRisk} tone={summary.highRisk ? "danger" : "safe"} />
            <Stat label="False Positive Rate" value={formatRate(summary.falsePositiveRate)} tone={rateTone(summary.falsePositiveRate, 10, 30)} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.25fr_.9fr]">
            <Card>
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <h2 className="text-xl font-bold text-white">Weekly Analysis Volume and Phishing Results</h2>
                  <p className="mt-1 text-sm text-slate-500">Grouped weekly totals compare analysis volume with confirmed phishing results.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                  <ChartMetric label="Analyses" value={summary.total} tone="cyan" />
                  <ChartMetric label="Phishing rate" value={formatRate(summary.phishingRate)} tone={summary.phishingRate !== null && summary.phishingRate >= 30 ? "danger" : "rose"} />
                  <ChartMetric label="Peak Week" value={summary.peakWeekLabel} description={summary.peakWeekVolumeLabel} tone="slate" />
                </div>
              </div>

              <div className="mt-5">
                <WeeklyThreatChart data={summary.weeklyThreatData} />
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-white">Report Insights</h2>
              <div className="mt-4 grid gap-3">
                {summary.insights.map((insight) => (
                  <div key={insight} className="rounded-md border border-line bg-slate-950/60 p-3 text-sm leading-6 text-slate-300">
                    {insight}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="text-xl font-bold text-white">Current Period vs Previous Period</h2>
            <div className="mt-4 overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-950/70 text-slate-400">
                  <tr>
                    <th className="p-3">Result</th>
                    <th className="p-3">Current Period</th>
                    <th className="p-3">Previous Period</th>
                    <th className="p-3">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.comparison.map((item) => (
                    <tr key={item.key} className="border-t border-line">
                      <td className="p-3 font-semibold text-white">{item.label}</td>
                      <td className="p-3 text-slate-300">{item.current}</td>
                      <td className="p-3 text-slate-300">{item.previous}</td>
                      <td className={`p-3 font-bold ${item.changeClass}`}>{item.changeLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card>
              <h2 className="text-xl font-bold text-white">Most Targeted Domains</h2>
              <div className="mt-4 grid gap-3">
                {summary.topDomains.length === 0 && <p className="text-sm text-slate-500">No URL domains were available in this reporting period.</p>}
                {summary.topDomains.map((item) => (
                  <div key={item.domain} className="grid gap-2 rounded-md border border-line bg-slate-950/60 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <span className="break-all font-mono text-sm font-semibold text-white">{item.domain}</span>
                    <Badge>{item.count} hit{item.count === 1 ? "" : "s"}</Badge>
                    <span className={`text-sm font-bold ${riskColor(item.averageRisk)}`}>{item.averageRisk.toFixed(1)} avg risk</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-white">Highest Average-Risk Domains</h2>
              <div className="mt-4 grid gap-3">
                {summary.highestRiskDomains.length === 0 && <p className="text-sm text-slate-500">No positive-risk URL domains were available in this reporting period.</p>}
                {summary.highestRiskDomains.map((item) => (
                  <div key={item.domain} className="grid gap-2 rounded-md border border-line bg-slate-950/60 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span className="break-all font-mono text-sm font-semibold text-white">{item.domain}</span>
                    <span className={`text-sm font-bold ${riskColor(item.averageRisk)}`}>{item.averageRisk.toFixed(1)} avg risk</span>
                    <span className="text-xs text-slate-500 sm:col-span-2">{item.count} hit{item.count === 1 ? "" : "s"} - max risk {item.maxRisk.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-white">Top Threat Indicators</h2>
              <div className="mt-4 grid gap-3">
                {summary.topIndicators.length === 0 && <p className="text-sm text-slate-500">No repeated indicators were found in this reporting period.</p>}
                {summary.topIndicators.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-md border border-line bg-slate-950/60 p-3">
                    <span className="text-sm text-slate-300">{securityLabel(item.name)}</span>
                    <Badge>{item.count}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-bold text-white">Detailed Period Table</h2>
                <p className="mt-1 text-sm text-slate-500">Export this table as CSV/PDF or open an individual report for evidence details.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={exportReportCsv}><Download className="h-4 w-4" /> CSV</Button>
                <Button onClick={exportPdf}><FileText className="h-4 w-4" /> PDF</Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="bg-slate-950/70 text-slate-400">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">Risk Score</th>
                    <th className="p-3">Sender</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id} className="border-t border-line align-top">
                      <td className="p-3 text-slate-400">{formatReadableDateTime(item.created_at)}</td>
                      <td className="p-3"><Badge>{securityLabel(item.analysis_source)}</Badge></td>
                      <td className="p-3"><Badge className={riskBadgeClass(item.risk_score)}>{securityLabel(bucketFor(item.classification))}</Badge></td>
                      <td className={`p-3 text-lg font-black ${riskColor(item.risk_score)}`}>{Math.round(item.risk_score)}</td>
                      <td className={cn("break-all p-3 text-slate-300", textDirectionClass(item.sender || ""))}>{item.sender || "Unknown sender"}</td>
                      <td className={cn("break-words p-3 font-semibold text-white", textDirectionClass(item.subject || ""))}>{item.subject || "Untitled analysis"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/analyses/${item.id}`}><Button variant="secondary"><FileText className="h-4 w-4" /> View</Button></Link>
                          <OverflowMenu open={menuOpenId === item.id} onToggle={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}>
                            <OverflowMenuItem onClick={() => download(item.id, "pdf")}><FileText className="h-4 w-4" /> Download PDF</OverflowMenuItem>
                            <OverflowMenuItem onClick={() => download(item.id, "json")}><FileJson className="h-4 w-4" /> Export JSON</OverflowMenuItem>
                            <OverflowMenuItem onClick={() => reanalyze(item)}><RotateCcw className="h-4 w-4" /> Re-analyze</OverflowMenuItem>
                          </OverflowMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Select({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return (
    <select aria-label={label} className="h-11 rounded-md border border-line bg-slate-950 px-3 text-sm text-slate-100 outline-none transition hover:border-slate-500/60 focus:border-cyan/80 focus:ring-2 focus:ring-cyan/20" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((item) => <option key={item} value={item}>{periodLabel(item)}</option>)}
    </select>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "safe" | "warn" | "danger" }) {
  const toneClass = {
    neutral: "text-white",
    safe: "text-emerald",
    warn: "text-amber",
    danger: "text-rose-300",
  }[tone];
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </Card>
  );
}

function ChartMetric({ label, value, description, tone }: { label: string; value: string | number; description?: string; tone: "cyan" | "rose" | "danger" | "slate" }) {
  const toneClass = {
    cyan: "text-cyan",
    rose: "text-rose-200",
    danger: "text-rose-300",
    slate: "text-slate-100",
  }[tone];
  return (
    <div className="rounded-md border border-line bg-slate-950/55 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${toneClass}`}>{value}</p>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
    </div>
  );
}

function rateTone(value: number | null, warnAt = 10, dangerAt = 30): "neutral" | "safe" | "warn" | "danger" {
  if (value === null) return "neutral";
  if (value >= dangerAt) return "danger";
  if (value >= warnAt) return "warn";
  return "safe";
}

function ReportsSkeleton() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-lg border border-line bg-white/[0.04]" />)}
      </div>
      <Card>
        <div className="mb-4 h-6 w-72 animate-pulse rounded bg-white/[0.05]" />
        <ChartSkeleton />
      </Card>
    </div>
  );
}

function buildReportSummary(rows: AnalysisListItem[], previousRows: AnalysisListItem[], details: Analysis[], feedback: Feedback[], range: DateRange) {
  const phishing = phishingCount(rows);
  const phishingRate = phishingRateForRows(rows);
  const previousPhishingRate = phishingRateForRows(previousRows);
  const highRisk = rows.filter((item) => item.risk_score >= 60).length;
  const periodFeedback = feedback.filter((item) => dateInRange(item.created_at, range));
  const falsePositiveCount = periodFeedback.filter((item) => item.feedback_type === "false_positive").length;
  const falsePositiveRate = rows.length ? Math.round((falsePositiveCount / rows.length) * 1000) / 10 : null;
  const change = previousRows.length && previousPhishingRate && phishingRate !== null ? ((phishingRate - previousPhishingRate) / previousPhishingRate) * 100 : null;

  const currentCounts = bucketCounts(rows);
  const previousCounts = bucketCounts(previousRows);
  const comparison = RESULT_BUCKETS.map((key) => {
    const current = currentCounts[key] || 0;
    const previous = previousCounts[key] || 0;
    const percent = previous ? ((current - previous) / previous) * 100 : current > 0 ? null : 0;
    return {
      key,
      label: securityLabel(key),
      current,
      previous,
      changeLabel: percent === null ? "New" : signedPercent(percent),
      changeClass: percent === null || percent > 0 ? "text-amber" : percent < 0 ? "text-emerald" : "text-slate-300",
    };
  });

  const weeklyThreatData = buildWeeklyThreatData(rows, range);
  const peak = peakWeek(weeklyThreatData);
  const domainStats = buildDomainStats(details);
  const topDomains = [...domainStats].sort((a, b) => b.count - a.count || b.averageRisk - a.averageRisk).slice(0, 8);
  const highestRiskDomains = buildHighestRiskDomains(domainStats);
  const topIndicators = buildTopIndicators(details);
  const insights = buildInsights({
    phishingRate,
    previousPhishingRate,
    total: rows.length,
    change,
    highRisk,
    peak,
    highestRiskDomains,
    topDomains,
    topIndicators,
  });

  return {
    total: rows.length,
    phishing,
    phishingRate,
    previousPhishingRate,
    highRisk,
    falsePositiveRate,
    change,
    changeLabel: previousRows.length === 0 ? "No Previous Data" : previousPhishingRate === 0 && phishingRate !== null && phishingRate > 0 ? "New" : change === null ? "No Change" : signedPercent(change),
    changeTone: previousRows.length === 0 ? "neutral" as const : previousPhishingRate === 0 && phishingRate !== null && phishingRate > 0 ? "danger" as const : change === null ? "neutral" as const : change > 0 ? "danger" as const : change < 0 ? "safe" as const : "neutral" as const,
    comparison,
    weeklyThreatData,
    peakWeekLabel: peak && peak.totalAnalyses ? peak.label : "No activity",
    peakWeekVolumeLabel: peak && peak.totalAnalyses ? `${peak.totalAnalyses} ${plural(peak.totalAnalyses, "analysis", "analyses")}` : "0 analyses",
    topDomains,
    highestRiskDomains,
    topIndicators,
    insights,
  };
}

function bucketFor(classification: string) {
  if (classification === "low_risk" || classification === "suspicious") return "suspicious";
  if (classification === "critical_threat") return "critical";
  return classification;
}

function bucketCounts(rows: AnalysisListItem[]) {
  return rows.reduce<Record<string, number>>((acc, item) => {
    const key = bucketFor(item.classification);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildDomainStats(details: Analysis[]) {
  const domainMap = new Map<string, { count: number; totalRisk: number; maxRisk: number }>();
  details.forEach((analysis) => {
    analysis.urls.forEach((url) => {
      const domain = normalizeDomain(url.domain || url.original_url || "");
      if (!domain) return;
      const current = domainMap.get(domain) || { count: 0, totalRisk: 0, maxRisk: 0 };
      domainMap.set(domain, {
        count: current.count + 1,
        totalRisk: current.totalRisk + (url.risk_score || 0),
        maxRisk: Math.max(current.maxRisk, url.risk_score || 0),
      });
    });
  });
  return Array.from(domainMap.entries()).map(([domain, value]) => ({
      domain,
      count: value.count,
      averageRisk: value.count ? value.totalRisk / value.count : 0,
      maxRisk: value.maxRisk,
    }));
}

function buildHighestRiskDomains(domains: Array<{ domain: string; count: number; averageRisk: number; maxRisk: number }>) {
  return domains
    .filter((item) => item.averageRisk > 0)
    .sort((a, b) => b.averageRisk - a.averageRisk || b.maxRisk - a.maxRisk || b.count - a.count)
    .slice(0, 8);
}

function normalizeDomain(value: string) {
  let domain = value.trim().toLowerCase().normalize("NFKC").replace(/\.+$/, "");
  if (!domain) return "";
  try {
    const parsed = new URL(domain.includes("://") ? domain : `https://${domain}`);
    domain = parsed.hostname.toLowerCase().normalize("NFKC").replace(/\.+$/, "");
  } catch {
    domain = domain.split("/")[0].split(":")[0].replace(/\.+$/, "");
  }
  if (!domain || ["unknown", "test", "localhost"].includes(domain) || domain.endsWith(".test") || !domain.includes(".")) return "";
  return domain;
}

function buildTopIndicators(details: Analysis[]) {
  const indicatorMap = new Map<string, number>();
  details.forEach((analysis) => {
    analysis.indicators.forEach((indicator) => {
      indicatorMap.set(indicator.type, (indicatorMap.get(indicator.type) || 0) + 1);
    });
  });
  return Array.from(indicatorMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildInsights({
  phishingRate,
  previousPhishingRate,
  total,
  change,
  highRisk,
  peak,
  highestRiskDomains,
  topDomains,
  topIndicators,
}: {
  phishingRate: number | null;
  previousPhishingRate: number | null;
  total: number;
  change: number | null;
  highRisk: number;
  peak: ReturnType<typeof peakWeek>;
  highestRiskDomains: Array<{ domain: string; count: number; averageRisk: number; maxRisk: number }>;
  topDomains: Array<{ domain: string; count: number; averageRisk: number; maxRisk: number }>;
  topIndicators: Array<{ name: string; count: number }>;
}) {
  const insights: string[] = [];
  const baselineInsight =
    previousPhishingRate === null
      ? "No previous-period data is available for this range."
      : previousPhishingRate === 0 && phishingRate !== null && phishingRate > 0
        ? "Phishing activity appeared in the current period after no phishing results in the previous period."
        : change !== null && change > 0
          ? `Phishing increased by ${Math.abs(change).toFixed(1)}% compared with the previous period.`
          : change !== null && change < 0
            ? `Phishing decreased by ${Math.abs(change).toFixed(1)}% compared with the previous period.`
            : `Phishing remained stable at ${formatRate(phishingRate)}, matching the previous period.`;
  if (highRisk > 0) {
    insights.push(`${highRisk} high-risk analysis${highRisk === 1 ? "" : "es"} should be prioritized for review.`);
  } else {
    insights.push("No high-risk analyses were recorded in the selected period.");
  }
  if (phishingRate !== null) {
    insights.push(`Phishing accounted for ${phishingRate.toFixed(1)}% of analyses during this period.`);
  }
  if (peak && peak.totalAnalyses > 0) {
    insights.push(`${peak.label} had the highest analysis volume with ${peak.totalAnalyses} ${plural(peak.totalAnalyses, "analysis", "analyses")}.`);
  }
  if (topIndicators[0]) {
    insights.push(`${securityLabel(topIndicators[0].name)} was the most repeated indicator.`);
  }
  if (topDomains[0]) {
    insights.push(`${topDomains[0].domain} was the most targeted domain with ${topDomains[0].count} ${topDomains[0].count === 1 ? "hit" : "hits"}.`);
  }
  if (highestRiskDomains[0]) {
    insights.push(`${highestRiskDomains[0].domain} had the highest average risk among positive-risk domains.`);
  }
  if (total < 5) {
    insights.push("This report contains fewer than 5 analyses, so rates may be volatile.");
  }
  insights.push(baselineInsight);
  return insights;
}

function dateRangeForPeriod(period: string, range: { from: string; to: string }): DateRange {
  if (period === "custom") {
    return {
      from: range.from ? `${range.from}T00:00:00` : undefined,
      to: range.to ? `${range.to}T23:59:59` : undefined,
    };
  }
  if (period === "this_month" || period === "previous_month") {
    const now = new Date();
    const monthOffset = period === "previous_month" ? -1 : 0;
    const from = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const to = period === "previous_month"
      ? new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      : now;
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const days = Number(period);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

function previousDateRangeFor(range: DateRange): DateRange {
  if (!range.from || !range.to) return {};
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return {};
  const durationMs = to.getTime() - from.getTime();
  if (durationMs <= 0) return {};
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - durationMs);
  return { from: previousFrom.toISOString(), to: previousTo.toISOString() };
}

function paramsForRange(range: DateRange) {
  const params: Record<string, string | number> = { page_size: 100, sort: "created_at_desc" };
  if (range.from) params.date_from = range.from;
  if (range.to) params.date_to = range.to;
  return range.from || range.to ? params : undefined;
}

function dateInRange(value: string, range: DateRange) {
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return false;
  if (range.from && date < new Date(range.from).getTime()) return false;
  if (range.to && date > new Date(range.to).getTime()) return false;
  return true;
}

function periodLabel(value: string) {
  return {
    "7": "Last 7 days",
    "30": "Last 30 days",
    this_month: "This Month",
    previous_month: "Previous Month",
    custom: "Custom range",
  }[value] || value;
}

function signedPercent(value: number) {
  if (Math.abs(value) < 0.05) return "0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function htmlToText(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent?.trim() || "";
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function riskBadgeClass(score: number) {
  if (score >= 80) return "border-rose-400/40 text-rose-200";
  if (score >= 60) return "border-red-400/40 text-red-200";
  if (score >= 40) return "border-amber/40 text-amber";
  if (score >= 20) return "border-sky-400/40 text-sky-200";
  return "border-emerald/40 text-emerald";
}
