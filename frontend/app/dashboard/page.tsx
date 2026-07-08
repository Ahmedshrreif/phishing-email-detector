"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Bell, CheckCircle2, Crosshair, Server, ShieldAlert, Zap, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { ActivityBarChart, ChartSkeleton } from "@/components/charts/security-charts";
import { client } from "@/services/api";
import type { DashboardSummary } from "@/types/api";
import { buildSevenDayActivity } from "@/lib/chart-analytics";
import { cn, riskColor, securityLabel, textDirectionClass } from "@/lib/utils";

type SystemStatus = {
  status: string;
  detail: string;
};

type AlertTone = "safe" | "warn" | "danger" | "neutral";
type DashboardAlert = { label: string; icon: ReactNode; tone: AlertTone; href?: string };

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ status: "checking", detail: "Checking system health..." });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await client.dashboard());
    } catch {
      setData(null);
      setError("Dashboard data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    client
      .health()
      .then((health) => {
        const status = String(health?.status || "unknown");
        const modelAvailable = Boolean(health?.model?.available);
        setSystemStatus({
          status,
          detail: modelAvailable ? "API, database, and model health checks are available." : "API is responding, but the ML model needs attention.",
        });
      })
      .catch(() => {
        setSystemStatus({
          status: "limited",
          detail: "System health details require admin access. Dashboard data is still reachable.",
        });
      });
  }, [loadDashboard]);

  const activityData = useMemo(() => buildSevenDayActivity(data?.trend || []), [data]);
  const alerts = buildAlerts(data, systemStatus);

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan">Live overview - last 7 days</p>
          <h1 className="mt-2 text-3xl font-black text-white">Security Dashboard</h1>
          <p className="mt-2 text-slate-400">A quick view of current analysis activity, alerts, indicators, and recent reports.</p>
        </div>
        <Link href="/analyzer"><Button><Crosshair className="h-4 w-4" /> New Analysis</Button></Link>
      </div>

      {error && <Card className="mb-5 border-amber/40 text-amber-200">{error}</Card>}
      {loading && <SkeletonDashboard />}
      {!loading && !data && error && (
        <Card>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">Last 7 Days Activity</h2>
            <p className="text-sm text-slate-500">Daily analysis volume, focused on what is happening now.</p>
          </div>
          <ActivityBarChart data={[]} error={error} onRetry={loadDashboard} />
        </Card>
      )}
      {data && (
        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            <Stat icon={Activity} label="Total Analyses" value={data.total_analyses} />
            <Stat icon={CheckCircle2} label="Safe" value={data.safe_emails} color="text-emerald" />
            <Stat icon={Crosshair} label="Low Risk" value={data.low_risk_emails} color="text-cyan" />
            <Stat icon={AlertTriangle} label="Suspicious" value={data.suspicious_emails} color="text-amber" />
            <Stat icon={ShieldAlert} label="Phishing" value={data.phishing_emails} color="text-red-300" />
            <Stat icon={Zap} label="Critical" value={data.critical_threats} color="text-rose-300" />
            <Stat icon={Crosshair} label="Average Risk" value={data.average_risk_score} color="text-cyan" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
            <Card>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Last 7 Days Activity</h2>
                <p className="text-sm text-slate-500">Daily analysis volume, focused on what is happening now.</p>
              </div>
              <ActivityBarChart data={activityData} />
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Server className="h-5 w-5 text-cyan" />
                  <h2 className="mt-3 text-xl font-bold text-white">System Status</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{systemStatus.detail}</p>
                </div>
                <StatusChip value={systemStatus.status} />
              </div>
              <div className="mt-5 border-t border-line pt-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <Bell className="h-4 w-4 text-cyan" />
                  Alerts
                </div>
                <div className="grid gap-2">
                  {alerts.map((alert) => (
                    <AlertRow key={alert.label} icon={alert.icon} label={alert.label} tone={alert.tone} href={alert.href} />
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="mb-4 text-xl font-bold text-white">Recent Analyses</h2>
              <div className="grid gap-3">
                {data.recent_analyses.length === 0 && <p className="text-sm text-slate-500">Run your first analysis to populate this feed.</p>}
                {data.recent_analyses.map((item) => (
                  <Link key={item.id} href={`/analyses/${item.id}`} className="rounded-md border border-line bg-slate-950/60 p-4 transition hover:border-cyan/40">
                    <div className="flex flex-col justify-between gap-2 md:flex-row">
                      <div>
                        <p className={cn("font-semibold text-white", textDirectionClass(item.subject || ""))}>{item.subject || "Untitled analysis"}</p>
                        <p className={cn("text-sm text-slate-400", textDirectionClass(item.sender || ""))}>{item.sender || "Unknown sender"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>{securityLabel(item.classification)}</Badge>
                        <span className={`text-sm font-bold ${riskColor(item.risk_score)}`}>{Math.round(item.risk_score)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-white">Common Indicators</h2>
              <div className="mt-4 grid gap-3">
                {data.common_indicators.length === 0 && <p className="text-sm text-slate-500">No repeated indicators in the last 7 days.</p>}
                {data.common_indicators.map((item) => (
                  <div key={item.indicator} className="flex items-center justify-between rounded-md bg-slate-950/60 p-3">
                    <span className="text-sm text-slate-300">{securityLabel(item.indicator)}</span>
                    <Badge>{item.count}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function buildAlerts(data: DashboardSummary | null, systemStatus: SystemStatus): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  if (!data) return [{ label: "Waiting for dashboard data", icon: <Activity className="h-4 w-4" />, tone: "neutral" }];
  if (data.critical_threats > 0) {
    alerts.push({ label: `${data.critical_threats} critical threat${data.critical_threats === 1 ? "" : "s"} in the last 7 days`, icon: <Zap className="h-4 w-4" />, tone: "danger" });
  }
  if (data.phishing_emails > 0) {
    alerts.push({
      label: `${data.phishing_emails} phishing result${data.phishing_emails === 1 ? " needs" : "s need"} review`,
      icon: <ShieldAlert className="h-4 w-4" />,
      tone: "warn",
      href: "/history?result=phishing",
    });
  }
  if (!["ok", "ready", "available"].includes(systemStatus.status.toLowerCase())) {
    alerts.push({ label: "System health is not fully confirmed", icon: <Server className="h-4 w-4" />, tone: "warn" });
  }
  if (alerts.length === 0) {
    alerts.push({ label: "No urgent alerts detected", icon: <CheckCircle2 className="h-4 w-4" />, tone: "safe" });
  }
  return alerts;
}

function Stat({ icon: Icon, label, value, color = "text-slate-100" }: { icon: LucideIcon; label: string; value: number; color?: string }) {
  return (
    <Card>
      <Icon className={`h-5 w-5 ${color}`} />
      <p className="mt-4 text-3xl font-black text-white">{Number.isFinite(value) ? value : 0}</p>
      <p className="text-sm text-slate-400">{label}</p>
    </Card>
  );
}

function AlertRow({ icon, label, tone, href }: { icon: ReactNode; label: string; tone: AlertTone; href?: string }) {
  const toneClass = {
    safe: "border-emerald/25 text-emerald",
    warn: "border-amber/30 text-amber-100",
    danger: "border-rose-400/30 text-rose-100",
    neutral: "border-line text-slate-300",
  }[tone];
  const className = `flex items-start gap-3 rounded-md border bg-slate-950/60 p-3 text-sm transition ${toneClass} ${href ? "hover:border-cyan/45 hover:bg-white/[0.04]" : ""}`;
  const content = (
    <>
      <span className="mt-0.5">{icon}</span>
      <span>{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>
      {content}
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-lg border border-line bg-white/[0.04]" />)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
        <Card>
          <div className="mb-4 h-6 w-60 animate-pulse rounded bg-white/[0.05]" />
          <ChartSkeleton className="h-72" />
        </Card>
        <div className="h-72 animate-pulse rounded-lg border border-line bg-white/[0.04]" />
      </div>
    </div>
  );
}
