"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Eye, FileJson, FileText, Filter, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmModal } from "@/components/ui/modal";
import { OverflowMenu, OverflowMenuItem } from "@/components/ui/overflow-menu";
import { api, apiErrorMessage, client, currentUser } from "@/services/api";
import type { AnalysisListItem } from "@/types/api";
import { showToast } from "@/lib/toast";
import { cn, downloadBlob, formatReadableDateTime, riskColor, securityLabel, textDirectionClass } from "@/lib/utils";

const PAGE_SIZE = 10;

type HistoryFilters = {
  search: string;
  classification: string;
  source: string;
  date_from: string;
  date_to: string;
  sort: string;
  page: number;
};

const initialFilters: HistoryFilters = {
  search: "",
  classification: "",
  source: "",
  date_from: "",
  date_to: "",
  sort: "created_at_desc",
  page: 1,
};

export default function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AnalysisListItem[]>([]);
  const [filters, setFilters] = useState<HistoryFilters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const analyst = currentUser()?.full_name || "Current user";

  const hasFilters = useMemo(
    () => Boolean(filters.search || filters.classification || filters.source || filters.date_from || filters.date_to),
    [filters],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params: Record<string, string | number> = { page: filters.page, page_size: PAGE_SIZE, sort: filters.sort };
    Object.entries(filters).forEach(([key, value]) => {
      if (!value || ["page", "sort"].includes(key)) return;
      if (key === "date_from") params[key] = `${value}T00:00:00`;
      else if (key === "date_to") params[key] = `${value}T23:59:59`;
      else params[key] = value;
    });
    try {
      setRows(await client.analyses(params));
    } catch (requestError: unknown) {
      setRows([]);
      setError(apiErrorMessage(requestError, "History is unavailable. Check the API service and reload this page."));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const result = searchParams.get("result") || searchParams.get("classification");
    const source = searchParams.get("source");
    if (!result && !source) return;
    setFilters((value) => ({
      ...value,
      classification: result || value.classification,
      source: source || value.source,
      page: 1,
    }));
  }, []);

  async function deleteRow(id: string) {
    setActionId(id);
    setMenuOpenId(null);
    setPendingDeleteId(null);
    setMessage("");
    try {
      await client.deleteAnalysis(id);
      setRows((items) => items.filter((item) => item.id !== id));
      setMessage("Analysis deleted.");
      showToast({ title: "Analysis deleted", tone: "success" });
    } catch (requestError: unknown) {
      const text = apiErrorMessage(requestError, "Could not delete this analysis. Try again after the API is available.");
      setMessage(text);
      showToast({ title: "Delete failed", description: text, tone: "error" });
    } finally {
      setActionId(null);
    }
  }

  async function reanalyze(item: AnalysisListItem) {
    setActionId(item.id);
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
    } catch (requestError: unknown) {
      setMessage(apiErrorMessage(requestError, "Re-analysis failed. Open the report details and run a fresh analysis from the Analyzer page."));
    } finally {
      setActionId(null);
    }
  }

  async function mark(id: string, type: "false_positive" | "false_negative") {
    setActionId(id);
    setMenuOpenId(null);
    try {
      await client.submitFeedback(id, { feedback_type: type, suggested_label: type === "false_positive" ? "safe" : "phishing" });
      setMessage("Feedback marker submitted for admin review.");
      showToast({ title: "Feedback submitted", description: "The correction was sent for admin review.", tone: "success" });
    } catch (requestError: unknown) {
      const text = apiErrorMessage(requestError, "Could not submit feedback. Try again when the API service is available.");
      setMessage(text);
      showToast({ title: "Feedback failed", description: text, tone: "error" });
    } finally {
      setActionId(null);
    }
  }

  async function exportCsv() {
    try {
      const response = await api.get("/api/analyses/export.csv", { responseType: "text" });
      downloadBlob(response.data, "phishguard-history.csv", "text/csv");
      setMessage("CSV export downloaded.");
      showToast({ title: "CSV export downloaded", tone: "success" });
    } catch (requestError: unknown) {
      const text = apiErrorMessage(requestError, "CSV export failed. Check that the API service is running.");
      setMessage(text);
      showToast({ title: "CSV export failed", description: text, tone: "error" });
    }
  }

  async function downloadReport(id: string, format: "pdf" | "json") {
    setMenuOpenId(null);
    try {
      const response = await api.get(`/api/analyses/${id}/report`, { params: { format }, responseType: format === "pdf" ? "blob" : "text" });
      downloadBlob(response.data, `phishguard-${id}.${format}`, format === "pdf" ? "application/pdf" : "application/json");
      setMessage(format === "pdf" ? "PDF report downloaded." : "JSON export downloaded.");
      showToast({ title: format === "pdf" ? "PDF report downloaded" : "JSON export downloaded", tone: "success" });
    } catch (requestError: unknown) {
      const text = apiErrorMessage(requestError, `${format.toUpperCase()} export failed. Check that the API service is running.`);
      setMessage(text);
      showToast({ title: `${format.toUpperCase()} export failed`, description: text, tone: "error" });
    }
  }

  function updateFilter(patch: Partial<HistoryFilters>) {
    setFilters((value) => ({ ...value, ...patch, page: patch.page ?? 1 }));
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-black text-white">Analysis History</h1>
          <p className="mt-2 text-slate-400">Search, filter, re-analyze, export, and manage stored threat reports.</p>
        </div>
        <Button onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Filter className="h-4 w-4 text-cyan" />
          Filters
        </div>
        <div className="grid gap-3 xl:grid-cols-[1.25fr_.8fr_.8fr_.75fr_.75fr_.85fr]">
          <label className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input className="pl-9" placeholder="Search subject, sender, summary" value={filters.search} onChange={(event) => updateFilter({ search: event.target.value })} />
          </label>
          <Select label="Result" value={filters.classification} onChange={(value) => updateFilter({ classification: value })} options={["", "safe", "low_risk", "suspicious", "phishing", "critical_threat"]} />
          <Select label="Analysis Types" value={filters.source} onChange={(value) => updateFilter({ source: value })} options={["", "paste", "file", "url", "headers"]} />
          <label className="relative">
            <CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input className="pl-9" type="date" value={filters.date_from} onChange={(event) => updateFilter({ date_from: event.target.value })} aria-label="Date from" />
          </label>
          <label className="relative">
            <CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
            <Input className="pl-9" type="date" value={filters.date_to} onChange={(event) => updateFilter({ date_to: event.target.value })} aria-label="Date to" />
          </label>
          <Select label="Sort" value={filters.sort} onChange={(value) => updateFilter({ sort: value })} options={["created_at_desc", "created_at_asc", "risk_desc", "risk_asc"]} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={load}><Filter className="h-4 w-4" /> Apply Filters</Button>
          <Button variant="ghost" disabled={!hasFilters} onClick={() => setFilters(initialFilters)}>Clear Filters</Button>
        </div>
      </Card>

      {message && <Card className="mt-5 border-cyan/30 text-cyan">{message}</Card>}
      {error && <Card className="mt-5 border-amber/40 text-amber-100">{error}</Card>}

      <Card className="mt-5">
        <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <p className="text-sm text-slate-400">{loading ? "Loading analyses..." : `${rows.length} result${rows.length === 1 ? "" : "s"} on this page`}</p>
          <p className="text-xs text-slate-500">Use filters to narrow by source, result, or date range.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Result</th>
                <th className="px-3 py-3">Risk Score</th>
                <th className="px-3 py-3">Analyst</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} />)}
              {!loading && rows.map((item) => (
                <tr key={item.id} className="border-t border-line align-top">
                  <td className="px-3 py-4 text-slate-400">{formatReadableDateTime(item.created_at)}</td>
                  <td className="max-w-72 px-3 py-4">
                    <p className={cn("break-words font-semibold text-white", textDirectionClass(item.subject || ""))}>{item.subject || "Untitled analysis"}</p>
                    <p className={cn("mt-1 break-all text-xs text-slate-500", textDirectionClass(item.sender || ""))}>{item.sender || "Unknown source"}</p>
                  </td>
                  <td className="px-3 py-4"><Badge>{securityLabel(item.analysis_source)}</Badge></td>
                  <td className="px-3 py-4"><Badge className={riskBadgeClass(item.risk_score)}>{securityLabel(item.classification)}</Badge></td>
                  <td className={`px-3 py-4 text-lg font-black ${riskColor(item.risk_score)}`}>{Math.round(item.risk_score)}</td>
                  <td className="px-3 py-4 text-slate-300">{analyst}</td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/analyses/${item.id}`}><Button className="min-h-9 px-3" variant="secondary"><Eye className="h-4 w-4" /> View Details</Button></Link>
                      <Button className="min-h-9 px-3" variant="secondary" disabled={actionId === item.id} onClick={() => reanalyze(item)}><RotateCcw className="h-4 w-4" /> Re-analyze</Button>
                      <OverflowMenu open={menuOpenId === item.id} onToggle={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}>
                        <OverflowMenuItem onClick={() => mark(item.id, "false_positive")}>Mark as False Positive</OverflowMenuItem>
                        <OverflowMenuItem onClick={() => mark(item.id, "false_negative")}>Mark as False Negative</OverflowMenuItem>
                        <OverflowMenuItem onClick={() => downloadReport(item.id, "pdf")}><FileText className="h-4 w-4" /> Download PDF</OverflowMenuItem>
                        <OverflowMenuItem onClick={() => downloadReport(item.id, "json")}><FileJson className="h-4 w-4" /> Export JSON</OverflowMenuItem>
                        <OverflowMenuItem tone="danger" onClick={() => { setMenuOpenId(null); setPendingDeleteId(item.id); }}><Trash2 className="h-4 w-4" /> Delete</OverflowMenuItem>
                      </OverflowMenu>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10">
                    <EmptyState
                      title={hasFilters ? "No analyses match the selected filters" : "No analyses yet"}
                      description={hasFilters ? "Clear filters or widen the date range." : "Run your first security analysis to populate history."}
                      action={!hasFilters && <Link href="/analyzer"><Button>New Analysis</Button></Link>}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <Button variant="secondary" disabled={filters.page <= 1 || loading} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}><ChevronLeft className="h-4 w-4" /> Previous</Button>
          <span className="text-sm text-slate-400">Page {filters.page}</span>
          <Button variant="secondary" disabled={rows.length < PAGE_SIZE || loading} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </Card>
      <ConfirmModal
        open={Boolean(pendingDeleteId)}
        title="Delete analysis"
        description="This permanently deletes the selected analysis record and its report data. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => pendingDeleteId && deleteRow(pendingDeleteId)}
      />
    </AppShell>
  );
}

function Select({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return (
    <select aria-label={label} className="h-11 rounded-md border border-line bg-slate-950 px-3 text-sm text-slate-100 outline-none transition hover:border-slate-500/60 focus:border-cyan/80 focus:ring-2 focus:ring-cyan/20" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((item) => <option key={item || "all"} value={item}>{selectLabel(item, label)}</option>)}
    </select>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-t border-line">
      {Array.from({ length: 7 }).map((_, index) => (
        <td key={index} className="px-3 py-4">
          <div className="h-5 animate-pulse rounded bg-white/[0.06]" />
        </td>
      ))}
    </tr>
  );
}

function htmlToText(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.textContent?.trim() || "";
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function selectLabel(value: string, label: string) {
  if (!value) return label === "Result" ? "All Results" : `All ${label}`;
  const labels: Record<string, string> = {
    created_at_desc: "Newest first",
    created_at_asc: "Oldest first",
    risk_desc: "Highest risk",
    risk_asc: "Lowest risk",
  };
  return labels[value] || securityLabel(value);
}

function riskBadgeClass(score: number) {
  if (score >= 80) return "border-rose-400/40 text-rose-200";
  if (score >= 60) return "border-red-400/40 text-red-200";
  if (score >= 40) return "border-amber/40 text-amber";
  if (score >= 20) return "border-sky-400/40 text-sky-200";
  return "border-emerald/40 text-emerald";
}
