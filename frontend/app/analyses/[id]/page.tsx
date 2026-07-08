"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, Flag, RefreshCcw, ShieldCheck, WifiOff } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RiskGauge } from "@/components/risk-gauge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { api, apiErrorMessage, client } from "@/services/api";
import type { Analysis } from "@/types/api";
import { showToast } from "@/lib/toast";
import { cn, downloadBlob, riskBorderColor, riskLabel } from "@/lib/utils";

type AccordionKey = "sender" | "authentication" | "urls" | "attachments" | "language" | "technical";

export default function AnalysisResultPage() {
  const params = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ feedback_type: "", suggested_label: "", notes: "" });
  const [open, setOpen] = useState<Record<AccordionKey, boolean>>({
    sender: true,
    authentication: true,
    urls: false,
    attachments: false,
    language: false,
    technical: false,
  });

  useEffect(() => {
    loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const modelConfidence = useMemo(() => {
    const value = analysis?.components.machine_learning?.confidence;
    return typeof value === "number" && value > 0 ? `${roundOne(value)}%` : "Unavailable";
  }, [analysis]);

  async function loadAnalysis() {
    setLoading(true);
    setLoadError("");
    try {
      setAnalysis(await client.analysis(params.id));
    } catch (error: unknown) {
      const raw = sessionStorage.getItem("phishguard.latestAnalysis");
      if (raw) {
        const local = JSON.parse(raw) as Analysis;
        if (local.analysis_id === params.id) {
          setAnalysis(local);
          setLoadError("Loaded the latest local result because the API copy is unavailable. Refresh after the backend is online to sync the stored report.");
          return;
        }
      }
      setLoadError(apiErrorMessage(error, "Analysis failed to load. Check that the backend service is running, then reload the report."));
    } finally {
      setLoading(false);
    }
  }

  async function download(format: "pdf" | "json") {
    try {
      const response = await api.get(`/api/analyses/${params.id}/report`, { params: { format }, responseType: format === "pdf" ? "blob" : "text" });
      downloadBlob(response.data, `phishguard-${params.id}.${format}`, format === "pdf" ? "application/pdf" : "application/json");
      showToast({ title: format === "pdf" ? "PDF report downloaded" : "JSON export downloaded", tone: "success" });
    } catch (error: unknown) {
      const text = apiErrorMessage(error, `${format.toUpperCase()} export failed. Check the API service and try again.`);
      setMessage(text);
      showToast({ title: `${format.toUpperCase()} export failed`, description: text, tone: "error" });
    }
  }

  async function submitFeedback(event: React.FormEvent) {
    event.preventDefault();
    if (!feedback.feedback_type) return;
    try {
      await client.submitFeedback(params.id, {
        feedback_type: feedback.feedback_type,
        suggested_label: feedback.suggested_label || undefined,
        notes: feedback.notes || undefined,
      });
      setMessage("Feedback submitted for admin review.");
      showToast({ title: "Feedback submitted", description: "An admin can review this correction in the feedback queue.", tone: "success" });
    } catch (error: unknown) {
      const text = apiErrorMessage(error, "Could not submit feedback for this analysis. Check the API service and try again.");
      setMessage(text);
      showToast({ title: "Feedback failed", description: text, tone: "error" });
    }
  }

  function toggle(section: AccordionKey) {
    setOpen((value) => ({ ...value, [section]: !value[section] }));
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white">Analysis Result</h1>
          <p className="mt-2 text-slate-400">Analyzing email evidence and loading the security report...</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
          <Card className="h-80 animate-pulse" />
          <Card className="h-80 animate-pulse" />
        </div>
      </AppShell>
    );
  }

  if (!analysis) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-3xl border-amber/40">
          <div className="flex items-start gap-3">
            <WifiOff className="mt-1 h-5 w-5 text-amber" />
            <div>
              <h1 className="text-2xl font-black text-white">Analysis unavailable</h1>
              <p className="mt-2 leading-7 text-slate-300">{loadError || "The report could not be loaded."}</p>
              <p className="mt-2 text-sm text-slate-500">Try refreshing the page. If the problem continues, verify that the API is running on port 8000.</p>
              <Button className="mt-5" variant="secondary" onClick={loadAnalysis}><RefreshCcw className="h-4 w-4" /> Retry</Button>
            </div>
          </div>
        </Card>
      </AppShell>
    );
  }

  const isSafe = analysis.classification === "safe";
  const noUrls = analysis.urls.length === 0;
  const noIndicators = analysis.indicators.filter((item) => item.type !== "risk_override").length === 0;
  const noAttachments = analysis.attachments.length === 0;
  const noLanguageRisk = (analysis.components.language?.score || 0) === 0;
  const noSenderRisk = (analysis.components.sender?.score || 0) === 0;
  const authNotEvaluated = isAuthNotEvaluated(analysis);
  const hasArabic = containsArabic(`${analysis.language_analysis.highlighted_text || ""} ${analysis.sanitized_preview || ""}`);
  const executiveSummary = isSafe
    ? `This email was classified as Safe with a risk score of ${Math.round(analysis.risk_score)}/100. No suspicious URLs, sender impersonation, dangerous attachments, or manipulative language were detected. ${authNotEvaluated ? "Email authentication could not be fully evaluated because raw headers were not provided." : "Email authentication did not introduce a high-risk finding."}`
    : analysis.summary;
  const recommendedAction = isSafe
    ? "The email appears safe to review. Continue normal caution and verify unexpected financial, login, or sensitive information requests through official channels."
    : analysis.recommended_action;
  const contributionEntries = Object.entries(analysis.components)
    .map(([key, value]) => ({ key, score: Math.round(value.score || 0) }))
    .filter((item) => item.score > 0);
  const zeroContributionNames = Object.entries(analysis.components)
    .filter(([, value]) => Math.round(value.score || 0) === 0)
    .map(([key]) => riskLabel(key).toLowerCase());

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-3xl font-black text-white">Analysis Result</h1>
          <p className="mt-2 text-slate-400">{new Date(analysis.created_at).toLocaleString()} - model {analysis.model_version}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/analyzer"><Button><ShieldCheck className="h-4 w-4" /> Analyze Another</Button></Link>
          <Button variant="secondary" onClick={() => download("pdf")}><Download className="h-4 w-4" /> Download PDF</Button>
          <Button className="min-h-9 px-3" variant="secondary" onClick={() => download("json")}>Export JSON</Button>
          <Link href="/history" className="text-sm font-semibold text-cyan hover:text-sky-200">Back to History</Link>
        </div>
      </div>

      {loadError && <Notice tone="warning">{loadError}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[.72fr_1.28fr]">
        <Card>
          <RiskGauge score={analysis.risk_score} classification={analysis.classification} />
          <div className="mt-5 grid grid-cols-2 gap-3 text-center">
            <MetricCard label="Model Confidence" value={modelConfidence} />
            <MetricCard label="Severity" value={riskLabel(analysis.severity)} />
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-white">Executive Summary</h2>
          <p className="mt-3 leading-7 text-slate-300">{executiveSummary}</p>

          <h2 className="mt-6 text-xl font-bold text-white">Why this result?</h2>
          <div className="mt-3 grid gap-2">
            <WhyRow ok={noUrls} text={noUrls ? "No suspicious URLs detected" : "URLs were found and reviewed"} />
            <WhyRow ok={noSenderRisk} text={noSenderRisk ? "No sender or domain impersonation detected" : "Sender risk signals were detected"} />
            <WhyRow ok={noAttachments} text={noAttachments ? "No dangerous attachments found" : "Attachments were found and reviewed"} />
            <WhyRow ok={noLanguageRisk} text={noLanguageRisk ? "No manipulative language detected" : "Manipulative language signals were detected"} />
            <WhyRow ok={!authNotEvaluated} warning={authNotEvaluated} text={authNotEvaluated ? "Email authentication was not evaluated" : "Email authentication was evaluated"} />
          </div>

          <h2 className="mt-6 text-xl font-bold text-white">Recommended Action</h2>
          <p className="mt-3 leading-7 text-slate-300">{recommendedAction}</p>
        </Card>
      </div>

      <Card className="mt-5">
        <h2 className="text-xl font-bold text-white">Category Risk Scores</h2>
        <p className="mt-2 text-sm text-slate-500">Category scores indicate risk strength within each area and are not added together.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {contributionEntries.map((item) => (
            <div key={item.key} className="flex items-center justify-between rounded-md border border-line bg-slate-950/60 p-3">
              <span className="text-sm text-slate-300">{riskLabel(item.key)}</span>
              <span className="font-bold text-white">{item.score} / 100</span>
            </div>
          ))}
        </div>
        {zeroContributionNames.length > 0 && (
          <p className="mt-4 rounded-md border border-line bg-slate-950/50 p-3 text-sm text-slate-400">
            No {joinHuman(zeroContributionNames)} risks detected.
          </p>
        )}
      </Card>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {noIndicators ? <CompactState text="No threat indicators detected" /> : <CompactState text={`${analysis.indicators.length} ${analysis.indicators.length === 1 ? "threat indicator" : "threat indicators"} detected`} tone="warning" />}
        {noUrls ? <CompactState text="No URLs found in this email" /> : <CompactState text={`${analysis.urls.length} ${analysis.urls.length === 1 ? "URL" : "URLs"} found and analyzed`} tone="info" />}
      </div>

      <Card className="mt-5">
        <h2 className="text-xl font-bold text-white">Detailed Analysis</h2>
        <div className="mt-4 grid gap-3">
          <Accordion title="Sender Analysis" open={open.sender} onToggle={() => toggle("sender")}>
            <DetailGrid
              items={[
                ["Display name", analysis.sender_analysis.display_name],
                ["Sender", analysis.sender_analysis.sender_address],
                ["Reply-to", analysis.sender_analysis.reply_to_address],
                ["Sender domain", analysis.sender_analysis.sender_domain],
                ["Domain mismatch", analysis.sender_analysis.domain_mismatch],
                ["Brand impersonation", analysis.sender_analysis.possible_brand_impersonation],
                ["Risk level", analysis.sender_analysis.risk_level],
              ]}
            />
          </Accordion>

          <Accordion title="Authentication" open={open.authentication} onToggle={() => toggle("authentication")}>
            <h3 className="font-semibold text-white">Authentication Status</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {["SPF", "DKIM", "DMARC"].map((name) => (
                <div key={name} className="rounded-md border border-line bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-500">{name}</p>
                  <p className="mt-1 font-semibold text-slate-300">{authLabel(analysis.header_findings[name.toLowerCase()])}</p>
                </div>
              ))}
            </div>
            {authNotEvaluated && (
              <p className="mt-3 rounded-md border border-slate-600/30 bg-slate-950/50 p-3 text-sm text-slate-400">
                Raw email headers were not provided, so authentication checks could not be performed.
              </p>
            )}
          </Accordion>

          <Accordion title="URL Analysis" open={open.urls} onToggle={() => toggle("urls")}>
            {analysis.urls.length === 0 ? (
              <CompactState text="No URLs found in this email" />
            ) : (
              <div className="grid gap-3">
                {analysis.urls.map((url) => (
                  <div key={url.original_url} className="rounded-md border border-line bg-slate-950/60 p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="break-all font-semibold text-white">{url.original_url}</p>
                      <Badge className={riskBorderColor(url.risk_score)}>{riskLabel(url.safety_verdict || url.risk_level)} - {Math.round(url.risk_score)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{url.risk_explanation}</p>
                    {url.probe_error && <p className="mt-3 text-sm text-amber-200">URL unavailable: {url.probe_error}</p>}
                  </div>
                ))}
              </div>
            )}
          </Accordion>

          <Accordion title="Attachment Analysis" open={open.attachments} onToggle={() => toggle("attachments")}>
            {analysis.attachments.length === 0 ? (
              <CompactState text="No attachments found" />
            ) : (
              <div className="grid gap-3">
                {analysis.attachments.map((item) => (
                  <div key={`${item.filename}-${item.sha256}`} className="rounded-md border border-line bg-slate-950/60 p-4">
                    <p className="break-all font-semibold text-white">{item.filename}</p>
                    <p className="mt-1 text-sm text-slate-400">{item.extension || "unknown extension"} - {item.file_size} bytes - {riskLabel(item.risk_level)}</p>
                  </div>
                ))}
              </div>
            )}
          </Accordion>

          <Accordion title="Language Analysis" open={open.language} onToggle={() => toggle("language")}>
            <h3 className="font-semibold text-white">Detected Language: {hasArabic ? "Arabic" : "Unknown / Mixed"}</h3>
            <div
              className={cn(
                "mt-3 max-h-80 overflow-auto rounded-md border border-line bg-slate-950/70 p-4 text-[15px] leading-7 text-slate-300",
                hasArabic && "text-right [font-family:Tahoma,Arial,sans-serif]"
              )}
              dir={hasArabic ? "rtl" : "ltr"}
              dangerouslySetInnerHTML={{ __html: analysis.language_analysis.highlighted_text || "No risky phrases highlighted." }}
            />
          </Accordion>

          <Accordion title="Technical Details" open={open.technical} onToggle={() => toggle("technical")}>
            <h3 className="font-semibold text-white">Model Explanation</h3>
            <div className="mt-3 grid gap-2">
              {analysis.top_model_factors.length === 0 && <p className="text-sm text-slate-500">Model factor details are unavailable for this input.</p>}
              {analysis.top_model_factors.map((item) => (
                <div key={`${item.feature}-${item.contribution}`} className="flex items-center justify-between rounded-md border border-line bg-slate-950/60 p-3">
                  <span className="text-sm text-slate-300">{item.feature}</span>
                  <Badge>{item.direction}</Badge>
                </div>
              ))}
            </div>
            <h3 className="mt-5 font-semibold text-white">Raw Component Scores</h3>
            <DetailGrid items={Object.entries(analysis.components).map(([key, value]) => [riskLabel(key), value.score ?? value.confidence ?? 0])} />
          </Accordion>
        </div>
      </Card>

      <Card className="mt-5">
        <h2 className="text-xl font-bold text-white">Sanitized Email Preview</h2>
        {analysis.remote_content_blocked && <p className="mt-3 rounded-md border border-cyan/30 bg-cyan/10 p-3 text-sm text-cyan">Remote content blocked for your protection.</p>}
        <div
          className={cn(
            "mt-4 max-h-96 overflow-auto rounded-md border border-line bg-slate-950/70 p-4 text-[15px] leading-7 text-slate-300",
            hasArabic && "text-right [font-family:Tahoma,Arial,sans-serif]"
          )}
          dir={hasArabic ? "rtl" : "ltr"}
          dangerouslySetInnerHTML={{ __html: analysis.sanitized_preview }}
        />
      </Card>

      <Card className="mt-5 max-w-3xl">
        <h2 className="text-lg font-bold text-white">Was this result accurate?</h2>
        <form onSubmit={submitFeedback} className="mt-4 grid gap-4">
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ["correct", "Yes"],
              ["false_positive", "False Positive"],
              ["false_negative", "False Negative"],
              ["unsure", "Not Sure"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFeedback({ ...feedback, feedback_type: value })}
                className={cn(
                  "rounded-md border border-line bg-slate-950/60 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500/60 hover:text-white",
                  feedback.feedback_type === value && "border-cyan/70 bg-cyan/10 text-cyan"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {feedback.feedback_type && (
            <div className="grid gap-3">
              <select className="h-11 rounded-md border border-line bg-slate-950 px-3 text-sm text-slate-100" value={feedback.suggested_label} onChange={(e) => setFeedback({ ...feedback, suggested_label: e.target.value })}>
                <option value="">No suggested label</option>
                {["safe", "low_risk", "suspicious", "phishing", "critical_threat"].map((item) => <option key={item} value={item}>{riskLabel(item)}</option>)}
              </select>
              <Textarea className="min-h-24" placeholder="Optional note" value={feedback.notes} onChange={(e) => setFeedback({ ...feedback, notes: e.target.value })} />
            </div>
          )}
          <Button className="w-[180px]" disabled={!feedback.feedback_type}><Flag className="h-4 w-4" /> Submit Feedback</Button>
          {message && <p className="text-sm text-cyan">{message}</p>}
        </form>
      </Card>
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-slate-950/60 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <Card className={cn("mb-5", tone === "warning" ? "border-amber/40 bg-amber/10 text-amber-100" : "border-cyan/30 bg-cyan/10 text-cyan")}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5" />
        <p className="text-sm leading-6">{children}</p>
      </div>
    </Card>
  );
}

function WhyRow({ text, ok, warning = false }: { text: string; ok: boolean; warning?: boolean }) {
  const Icon = warning ? AlertTriangle : CheckCircle2;
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-slate-950/50 p-3 text-sm">
      <Icon className={cn("h-4 w-4", warning ? "text-slate-400" : ok ? "text-emerald" : "text-amber")} />
      <span className={warning ? "text-slate-400" : ok ? "text-slate-200" : "text-amber-100"}>{text}</span>
    </div>
  );
}

function CompactState({ text, tone = "safe" }: { text: string; tone?: "safe" | "warning" | "info" }) {
  const Icon = tone === "warning" ? AlertTriangle : CheckCircle2;
  return (
    <Card className={cn(tone === "safe" && "border-emerald/30 bg-emerald/5", tone === "warning" && "border-amber/40 bg-amber/10", tone === "info" && "border-cyan/30 bg-cyan/10")}>
      <div className="flex items-center gap-2">
        <Icon className={cn("h-5 w-5", tone === "warning" ? "text-amber" : tone === "info" ? "text-cyan" : "text-emerald")} />
        <p className="font-semibold text-white">{text}</p>
      </div>
    </Card>
  );
}

function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-slate-950/40">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-white">
        {title}
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", open && "rotate-180 text-cyan")} />
      </button>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </div>
  );
}

function DetailGrid({ items }: { items: Array<[string, unknown]> }) {
  const visibleItems = items.filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!visibleItems.length) {
    return <p className="mt-3 rounded-md border border-line bg-slate-950/60 p-3 text-sm text-slate-500">No details available for this section.</p>;
  }
  return (
    <div className="mt-3 grid gap-2">
      {visibleItems.map(([label, value]) => (
        <div key={label} className="grid gap-1 rounded-md border border-line bg-slate-950/60 p-3 sm:grid-cols-[10rem_1fr]">
          <span className="text-xs font-semibold tracking-normal text-slate-500">{label}</span>
          <span className="break-words text-sm text-slate-200">{formatDetailValue(value)}</span>
        </div>
      ))}
    </div>
  );
}

function formatDetailValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map((item) => formatDetailValue(item)).join(", ") : "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value || "None");
}

function isAuthNotEvaluated(analysis: Analysis) {
  const values = [analysis.header_findings.spf, analysis.header_findings.dkim, analysis.header_findings.dmarc].map((item) => String(item || "").toLowerCase());
  return values.every((value) => !value || value === "missing" || value === "none" || value === "unknown");
}

function authLabel(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (!text || text === "missing" || text === "none" || text === "unknown") return "Not evaluated";
  return riskLabel(text);
}

function containsArabic(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function joinHuman(items: string[]) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}
