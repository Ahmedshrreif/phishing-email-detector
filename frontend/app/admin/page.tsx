"use client";

import { Activity, CalendarDays, Check, Database, Download, Eraser, KeyRound, PlugZap, RefreshCcw, Search, Server, ShieldCheck, Trash2, UserCog, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/modal";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";
import { OverflowMenu, OverflowMenuItem } from "@/components/ui/overflow-menu";
import { StatusChip } from "@/components/ui/status-chip";
import { apiErrorMessage, client, currentUser } from "@/services/api";
import type { Feedback, ModelVersion, User } from "@/types/api";
import { showToast } from "@/lib/toast";
import { downloadBlob, formatReadableDateTime, securityLabel } from "@/lib/utils";

type HealthPayload = {
  status?: string;
  database?: string;
  model?: {
    available?: boolean;
    version?: string;
    error?: string;
    metrics?: Record<string, unknown>;
  };
  optional_reputation_apis?: Record<string, boolean>;
};

type AdminTab = "overview" | "feedback" | "models" | "users" | "audit";
type ConfirmAction =
  | { type: "suspend_user"; user: User }
  | { type: "promote_user"; user: User }
  | { type: "clear_history"; user: User }
  | { type: "delete_user"; user: User }
  | { type: "activate_model"; version: string; actionLabel: string }
  | { type: "train_model" }
  | { type: "reject_feedback"; feedback: Feedback }
  | null;

const adminTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "feedback", label: "Feedback Queue" },
  { id: "models", label: "Models and Dataset" },
  { id: "users", label: "Users" },
  { id: "audit", label: "Audit Logs" },
];

const AUDIT_PAGE_SIZE = 12;
const MIN_TRAINING_SAMPLES = 50;

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "" });
  const [newPassword, setNewPassword] = useState("");
  const [userFilters, setUserFilters] = useState({ search: "", role: "", status: "" });
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [auditFilters, setAuditFilters] = useState({ search: "", event: "", user: "", status: "", date_from: "", date_to: "" });
  const [auditPage, setAuditPage] = useState(1);
  const [userMenuOpenId, setUserMenuOpenId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedUser = users.find((user) => user.id === selectedUserId) || null;
  const adminCount = users.filter((user) => user.role === "admin").length;
  const filteredUsers = users.filter((user) => {
    const search = userFilters.search.trim().toLowerCase();
    const matchesSearch = !search || `${user.full_name} ${user.email}`.toLowerCase().includes(search);
    const matchesRole = !userFilters.role || user.role === userFilters.role;
    const matchesStatus = !userFilters.status || (userFilters.status === "active" ? user.is_active : !user.is_active);
    return matchesSearch && matchesRole && matchesStatus;
  });
  const filteredLogs = useMemo(() => filterAuditLogs(logs, auditFilters), [logs, auditFilters]);
  const pagedLogs = filteredLogs.slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE);
  const auditPageCount = Math.max(1, Math.ceil(filteredLogs.length / AUDIT_PAGE_SIZE));

  useEffect(() => {
    setAdminUser(currentUser());
    load();
  }, []);

  useEffect(() => {
    if (activeTab !== "feedback") return;
    loadFeedbackQueue(true);
    const timer = window.setInterval(() => {
      loadFeedbackQueue(true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  useEffect(() => {
    if (!selectedUser) return;
    setEditForm({ full_name: selectedUser.full_name, email: selectedUser.email });
    setNewPassword("");
  }, [selectedUser]);

  async function load() {
    setMessage("");
    const failures: string[] = [];
    async function loadSection<T>(label: string, request: () => Promise<T>, apply: (value: T) => void) {
      try {
        apply(await request());
      } catch (error: unknown) {
        failures.push(`${label}: ${apiErrorMessage(error, "request failed")}`);
      }
    }

    await loadSection("Users", client.users, setUsers);
    await loadSection("Feedback", client.adminFeedback, setFeedback);
    await loadSection("Models", client.models, setModels);
    await loadSection("System health", client.health, setHealth);
    await loadSection("Audit logs", client.auditLogs, setLogs);

    if (failures.length) {
      setMessage(`Some admin data could not be loaded: ${Array.from(new Set(failures)).join("; ")}`);
    }
  }

  async function loadFeedbackQueue(silent = false) {
    if (!silent) setMessage("");
    try {
      setFeedback(await client.adminFeedback());
      if (!silent) showToast({ title: "Feedback queue refreshed", tone: "success" });
    } catch (error: unknown) {
      const text = apiErrorMessage(error, "Could not load the feedback queue.");
      if (!silent) setMessage(text);
      if (!silent) showToast({ title: "Feedback refresh failed", description: text, tone: "error" });
    }
  }

  async function runAdminAction(successMessage: string, action: () => Promise<{ message?: string } | User>) {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      const text = "message" in result && result.message ? result.message : successMessage;
      setMessage(text);
      showToast({ title: text, tone: "success" });
      await load();
    } catch (error: unknown) {
      const text = apiErrorMessage(error, "Admin action failed");
      setMessage(text);
      showToast({ title: "Admin action failed", description: text, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function selectUser(user: User) {
    setSelectedUserId(user.id);
    setEditForm({ full_name: user.full_name, email: user.email });
    setNewPassword("");
  }

  async function toggleUser(user: User) {
    await runAdminAction(user.is_active ? "User suspended." : "User restored.", () => client.updateUser(user.id, { is_active: !user.is_active }));
  }

  async function promote(user: User) {
    await runAdminAction(user.role === "admin" ? "User demoted." : "User promoted.", () => client.updateUser(user.id, { role: user.role === "admin" ? "user" : "admin" }));
  }

  async function saveSelectedUser() {
    if (!selectedUser) return;
    await runAdminAction("User profile updated.", () =>
      client.updateUser(selectedUser.id, {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
      })
    );
  }

  async function resetSelectedPassword() {
    if (!selectedUser) return;
    await runAdminAction("Password reset.", () => client.resetUserPassword(selectedUser.id, newPassword));
    setNewPassword("");
  }

  async function approve(id: string) {
    setBusy(true);
    setMessage("");
    try {
      await client.approveFeedback(id);
      setMessage("Feedback approved and added to the verified dataset.");
      showToast({ title: "Feedback approved", description: "The approved correction is now part of the verified dataset.", tone: "success" });
      await load();
    } catch (error: unknown) {
      const text = apiErrorMessage(error, "Feedback approval failed");
      setMessage(text);
      showToast({ title: "Feedback approval failed", description: text, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string, reason: string) {
    setBusy(true);
    setMessage("");
    try {
      await client.rejectFeedback(id, reason);
      setMessage("Feedback rejected with review reason recorded.");
      showToast({ title: "Feedback rejected", description: "The review reason was recorded for the audit trail.", tone: "success" });
      await load();
    } catch (error: unknown) {
      const text = apiErrorMessage(error, "Feedback rejection failed");
      setMessage(text);
      showToast({ title: "Feedback rejection failed", description: text, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function train() {
    if (approvedSamples < MIN_TRAINING_SAMPLES) {
      const text = `Training requires at least ${MIN_TRAINING_SAMPLES} approved feedback samples.`;
      setMessage(text);
      showToast({ title: "Training unavailable", description: text, tone: "error" });
      return;
    }
    setBusy(true);
    setMessage("Retraining started. Candidate must pass quality checks before activation.");
    showToast({ title: "Training started", description: "Candidate must pass quality checks before activation.", tone: "info" });
    try {
      await client.trainModel();
      setMessage("Candidate model trained successfully.");
      showToast({ title: "Candidate model trained", tone: "success" });
      await load();
    } catch (error: unknown) {
      const text = apiErrorMessage(error, "Candidate model failed quality checks.");
      setMessage(text);
      showToast({ title: "Candidate model failed", description: text, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function activate(version: string) {
    await client.activateModel(version);
    showToast({ title: "Model activated", description: version, tone: "success" });
    await load();
  }

  async function applyConfirmAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action.type === "suspend_user") {
      if (adminUser?.id === action.user.id && action.user.is_active) {
        setMessage("You cannot suspend your own admin account.");
        return;
      }
      await toggleUser(action.user);
    } else if (action.type === "promote_user") {
      if (action.user.role === "admin" && adminCount <= 1) {
        setMessage("You cannot demote the last admin account.");
        return;
      }
      await promote(action.user);
    } else if (action.type === "clear_history") {
      setSelectedUserId(action.user.id);
      await runAdminAction("User analyses deleted.", () => client.clearUserAnalyses(action.user.id));
    } else if (action.type === "delete_user") {
      if (adminUser?.id === action.user.id) {
        setMessage("You cannot delete your own admin account.");
        return;
      }
      if (action.user.role === "admin" && adminCount <= 1) {
        setMessage("You cannot delete the last admin account.");
        return;
      }
      setSelectedUserId(action.user.id);
      await runAdminAction("User deleted.", () => client.deleteUser(action.user.id));
      setSelectedUserId(null);
    } else if (action.type === "activate_model") {
      await activate(action.version);
    } else if (action.type === "train_model") {
      await train();
    } else if (action.type === "reject_feedback") {
      await reject(action.feedback.id, rejectReason.trim());
      setRejectReason("");
    }
  }

  function exportAuditCsv() {
    const rows = [
      ["Event", "User", "IP Address", "Status", "Date", "Details"],
      ...filteredLogs.map((log) => [
        securityLabel(String(log.action || "event")),
        String(log.user_email || log.user_id || "System"),
        String(log.ip_address || "Not Captured"),
        securityLabel(String(log.status || "recorded")),
        formatReadableDateTime(String(log.created_at || "")),
        auditDetails(log),
      ]),
    ];
    downloadBlob(rows.map((row) => row.map(csvCell).join(",")).join("\n"), "phishguard-audit-logs.csv", "text/csv");
    setMessage("Audit log CSV exported.");
    showToast({ title: "Audit log CSV exported", tone: "success" });
  }

  const activeModel = models.find((model) => model.is_active) || models[0];
  const modelMetrics = parseMetrics(activeModel?.metrics_json);
  const modelHyperparameters = parseMetrics(activeModel?.hyperparameters_json);
  const candidateModels = models.filter((model) => !model.is_active);
  const latestModel = models[0];
  const datasetSize = metricNumber(modelMetrics.dataset_size);
  const falsePositives = confusionValue(modelMetrics, "fp") ?? 0;
  const falseNegatives = confusionValue(modelMetrics, "fn") ?? 0;
  const reputationApis = health?.optional_reputation_apis || {};
  const approvedSamples = feedback.filter((item) => item.status === "approved").length;
  const pendingSamples = feedback.filter((item) => item.status === "pending").length;
  const pendingFeedback = feedback.filter((item) => item.status === "pending");
  const reviewedFeedback = feedback.filter((item) => item.status !== "pending");
  const orderedFeedback = [...pendingFeedback, ...reviewedFeedback];
  const trainingReady = approvedSamples >= MIN_TRAINING_SAMPLES;

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-black text-white">Admin Dashboard</h1>
          <p className="mt-2 text-slate-400">Review feedback, manage users, compare models, retrain safely, and inspect system health.</p>
        </div>
      </div>
      {message && <Card className="mb-5 border-cyan/30 text-cyan">{message}</Card>}

      <div className="mb-5 flex gap-2 overflow-x-auto rounded-lg border border-line bg-slate-950/45 p-2">
        {adminTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? "whitespace-nowrap rounded-md bg-cyan px-4 py-2 text-sm font-semibold text-slate-950"
                : "whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
            }
          >
            {tab.label}
            {tab.id === "feedback" && pendingSamples > 0 && (
              <span className="ml-2 rounded-full bg-rose-400 px-2 py-0.5 text-xs font-bold text-slate-950">{pendingSamples}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Activity className="h-6 w-6 text-cyan" />
              <h2 className="mt-3 text-xl font-bold text-white">System Health</h2>
            </div>
            <StatusBadge value={health?.status || "loading"} />
          </div>
          <div className="mt-4 grid gap-3">
            <HealthRow
              icon={<Server className="h-4 w-4" />}
              label="API"
              value={health ? securityLabel(health.status || "unknown") : "Loading"}
              status={health?.status || "loading"}
            />
            <HealthRow
              icon={<Database className="h-4 w-4" />}
              label="Database"
              value={health ? securityLabel(health.database || "unknown") : "Loading"}
              status={health?.database || "loading"}
            />
            <HealthRow
              icon={<ShieldCheck className="h-4 w-4" />}
              label="ML Model"
              value={health?.model?.available ? `Available${health.model.version ? ` (${health.model.version})` : ""}` : "Unavailable"}
              status={health?.model?.available ? "ok" : "degraded"}
              detail={health?.model?.error}
            />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <PlugZap className="h-4 w-4 text-cyan" />
              Reputation APIs
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(reputationApis).length === 0 && <Badge>Loading</Badge>}
              {Object.entries(reputationApis).map(([name, enabled]) => (
                <Badge key={name} className={enabled ? "border-emerald/40 text-emerald" : "border-amber/40 text-amber"}>
                  {securityLabel(name)}: {enabled ? "Operational" : "Not Configured"}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <ShieldCheck className="h-6 w-6 text-emerald" />
          <h2 className="mt-3 text-xl font-bold text-white">Model Metrics</h2>
          {activeModel ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge>{activeModel.is_active ? "Active" : "Candidate"}</Badge>
                <span className="text-sm text-slate-300">{activeModel.version}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {metricCards(modelMetrics).map((metric) => (
                  <div key={metric.label} className="rounded-md border border-line bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-500">{metric.label}</p>
                    <p className="mt-1 text-lg font-bold text-white">{metric.value}</p>
                  </div>
                ))}
              </div>
              {datasetSize > 0 && datasetSize < 100 && (
                <p className="mt-3 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber-100">
                  Limited evaluation dataset - {datasetSize} samples. False positives: {falsePositives}; false negatives: {falseNegatives}.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No model records yet.</p>
          )}
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-white">Dataset Management</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Approved feedback creates verified training samples. Candidate models must pass precision and recall thresholds before activation.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <MiniMetric label="Approved feedback" value={approvedSamples} />
            <MiniMetric label="Pending review" value={pendingSamples} />
          </div>
          {approvedSamples === 0 && (
            <EmptyState title="No approved samples yet" description="Approve reviewed feedback before starting a meaningful training run." />
          )}
          {pendingSamples > 0 && (
            <Button className="mt-4" variant="secondary" onClick={() => setActiveTab("feedback")}>
              Review {pendingSamples} Pending Feedback
            </Button>
          )}
          <Button className="mt-3" variant="secondary" disabled={!trainingReady || busy} onClick={train}>Train New Candidate</Button>
          {!trainingReady && <p className="mt-2 text-xs text-slate-500">Training is disabled until {MIN_TRAINING_SAMPLES} approved feedback samples are available.</p>}
        </Card>
      </div>
      )}

      {activeTab === "feedback" && (
      <div className="mt-5 grid gap-5">
        <Card>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-white">Feedback Review Queue</h2>
              <p className="mt-1 text-sm text-slate-400">{pendingSamples} pending review · {feedback.length} total feedback item{feedback.length === 1 ? "" : "s"}</p>
            </div>
            <Button variant="secondary" onClick={() => loadFeedbackQueue(false)} disabled={busy}>
              <RefreshCcw className="h-4 w-4" /> Refresh Queue
            </Button>
          </div>
          <div className="mt-4 grid gap-3">
            {feedback.length === 0 && <EmptyState title="Queue is clear" description="False positive and false negative reports will appear here for review." />}
            {orderedFeedback.map((item) => (
              <div key={item.id} className="rounded-md border border-line bg-slate-950/60 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{securityLabel(item.feedback_type)}</Badge>
                  <Badge>{securityLabel(item.status)}</Badge>
                  {item.suggested_label && <Badge>{securityLabel(item.suggested_label)}</Badge>}
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.notes || "No notes"}</p>
                <div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                  <span>Submitted {formatReadableDateTime(item.created_at)}</span>
                  {item.reviewed_at && <span>Reviewed {formatReadableDateTime(item.reviewed_at)}</span>}
                  {item.reviewed_by && <span className="break-all">Reviewer {shortId(item.reviewed_by)}</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" disabled={busy || item.status !== "pending"} onClick={() => approve(item.id)}><Check className="h-4 w-4" /> Approve</Button>
                  <Button
                    variant="secondary"
                    disabled={busy || item.status !== "pending"}
                    onClick={() => {
                      setRejectReason("");
                      setConfirmAction({ type: "reject_feedback", feedback: item });
                    }}
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      )}

      {activeTab === "models" && (
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <ShieldCheck className="h-6 w-6 text-emerald" />
          <h2 className="mt-3 text-xl font-bold text-white">Model Metrics</h2>
          {activeModel ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge>{activeModel.is_active ? "Active" : "Candidate"}</Badge>
                <span className="font-mono text-sm text-slate-300">{activeModel.version}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniDetail label="Dataset Version" value={activeModel.dataset_version} mono />
                <MiniDetail label="Last Evaluated" value={formatReadableDateTime(activeModel.created_at)} />
                <MiniDetail label="Validation Source" value={String(modelHyperparameters.source || "Model registry")} />
                <MiniDetail label="Candidate Status" value={candidateModels.length ? `${candidateModels.length} candidate${candidateModels.length === 1 ? "" : "s"} awaiting review` : "No candidate pending"} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {metricCards(modelMetrics).map((metric) => (
                  <div key={metric.label} className="rounded-md border border-line bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-500">{metric.label}</p>
                    <p className="mt-1 text-lg font-bold text-white">{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-md border border-line bg-slate-950/60 p-3">
                <p className="text-xs text-slate-500">Confusion Matrix</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="rounded bg-white/[0.04] p-2 text-slate-300">False Positives <b className="text-white">{falsePositives}</b></span>
                  <span className="rounded bg-white/[0.04] p-2 text-slate-300">False Negatives <b className="text-white">{falseNegatives}</b></span>
                  <span className="rounded bg-white/[0.04] p-2 text-slate-300">Min Precision <b className="text-white">{formatMetric(modelHyperparameters.min_precision ?? 0.6)}</b></span>
                  <span className="rounded bg-white/[0.04] p-2 text-slate-300">Min Recall <b className="text-white">{formatMetric(modelHyperparameters.min_recall ?? 0.6)}</b></span>
                </div>
              </div>
              {datasetSize > 0 && datasetSize < 100 && (
                <p className="mt-3 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber-100">
                  Experimental - Limited evaluation dataset: {datasetSize} samples. False positives: {falsePositives}; false negatives: {falseNegatives}.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No model records yet.</p>
          )}
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-white">Dataset Management</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Approved feedback creates verified training samples. Candidate models must pass precision and recall thresholds before activation.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <MiniMetric label="Approved feedback" value={approvedSamples} />
            <MiniMetric label="Pending review" value={pendingSamples} />
            <MiniMetric label="Minimum required" value={MIN_TRAINING_SAMPLES} />
            <MiniMetric label="Samples remaining" value={Math.max(0, MIN_TRAINING_SAMPLES - approvedSamples)} />
          </div>
          <div className="mt-4 grid gap-3 text-sm">
            <MiniDetail label="Dataset Version" value={activeModel?.dataset_version || "verified-feedback"} mono />
            <MiniDetail label="Last Training Date" value={latestModel ? formatReadableDateTime(latestModel.created_at) : "No training runs yet"} />
            <MiniDetail label="Candidate Status" value={candidateModels.length ? `${candidateModels.length} candidate model${candidateModels.length === 1 ? "" : "s"} available` : "No candidate model pending"} />
          </div>
          {!trainingReady && (
            <EmptyState title="Not enough approved samples" description={`Approve ${Math.max(0, MIN_TRAINING_SAMPLES - approvedSamples)} more reviewed feedback item${Math.max(0, MIN_TRAINING_SAMPLES - approvedSamples) === 1 ? "" : "s"} before starting a meaningful training run.`} />
          )}
          <Button className="mt-4" variant="secondary" disabled={!trainingReady || busy} onClick={() => setConfirmAction({ type: "train_model" })}>Train New Candidate</Button>
          {!trainingReady && <p className="mt-2 text-xs text-slate-500">Training is disabled until {MIN_TRAINING_SAMPLES} approved feedback samples are available.</p>}
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-white">Model Versions</h2>
          <div className="mt-4 grid gap-3">
            {models.map((model, index) => (
              <div key={model.id} className="rounded-md border border-line bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-white">{model.version}</p>
                    <p className="text-xs text-slate-500">{model.dataset_version}</p>
                  </div>
                  <Badge>{model.is_active ? "Active" : index === 0 ? "Candidate" : "Previous"}</Badge>
                </div>
                {!model.is_active && (
                  <Button className="mt-3" variant="secondary" onClick={() => setConfirmAction({ type: "activate_model", version: model.version, actionLabel: index === 0 ? "Activate Candidate" : "Roll Back to This Version" })}>
                    {index === 0 ? "Activate Candidate" : "Roll Back to This Version"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
      )}

      {activeTab === "users" && (
      <div className="mt-5 grid gap-5">
        <Card>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-xl font-bold text-white">User Management</h2>
              <p className="mt-1 text-sm text-slate-500">Search, filter, and manage account access without crowding the table.</p>
            </div>
            <Button variant="secondary" onClick={() => setMessage("Invite user workflow needs SMTP configuration before invitation emails can be sent.")}>
              <UserPlus className="h-4 w-4" /> Invite User
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <label className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <Input className="pl-9" placeholder="Search users" value={userFilters.search} onChange={(event) => setUserFilters({ ...userFilters, search: event.target.value })} />
            </label>
            <AdminSelect label="Role filter" value={userFilters.role} onChange={(value) => setUserFilters({ ...userFilters, role: value })} options={["", "user", "analyst", "admin"]} />
            <AdminSelect label="Status filter" value={userFilters.status} onChange={(value) => setUserFilters({ ...userFilters, status: value })} options={["", "active", "suspended"]} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[980px] table-fixed text-left text-sm">
                <thead className="bg-slate-950/70 text-slate-400">
                  <tr>
                    <th className="w-[18%] p-3">Name</th>
                    <th className="w-[27%] p-3">Email</th>
                    <th className="w-[10%] p-3">Role</th>
                    <th className="w-[11%] p-3">Status</th>
                    <th className="w-[15%] p-3">Last Login</th>
                    <th className="w-[19%] p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isSelf = adminUser?.id === user.id;
                    const isLastAdmin = user.role === "admin" && adminCount <= 1;
                    const selected = selectedUserId === user.id;
                    return (
                      <tr key={user.id} className={selected ? "border-t border-cyan/40 bg-cyan/5" : "border-t border-line"}>
                        <td className="break-words p-3 text-white">{user.full_name}</td>
                        <td className="truncate p-3 text-slate-300" title={user.email}>{user.email}</td>
                        <td className="p-3"><Badge>{user.role}</Badge></td>
                        <td className="break-words p-3">{user.is_active ? "Active" : "Suspended"}</td>
                        <td className="break-words p-3 text-slate-400">{user.last_login_at ? formatReadableDateTime(user.last_login_at) : "Never"}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button className="min-h-9 px-3" variant="secondary" disabled={busy} onClick={() => selectUser(user)}>
                              <UserCog className="h-4 w-4" /> Manage
                            </Button>
                            <OverflowMenu open={userMenuOpenId === user.id} onToggle={() => setUserMenuOpenId(userMenuOpenId === user.id ? null : user.id)}>
                              <OverflowMenuItem onClick={() => { setUserMenuOpenId(null); setConfirmAction({ type: "promote_user", user }); }}>
                                {user.role === "admin" ? "Demote" : "Promote"}
                              </OverflowMenuItem>
                              <OverflowMenuItem onClick={() => { setUserMenuOpenId(null); setConfirmAction({ type: "suspend_user", user }); }}>
                                {user.is_active ? "Suspend" : "Reactivate"}
                              </OverflowMenuItem>
                              <OverflowMenuItem onClick={() => { setUserMenuOpenId(null); selectUser(user); }}>Reset Password</OverflowMenuItem>
                              <OverflowMenuItem onClick={() => { setUserMenuOpenId(null); selectUser(user); }}>View Activity</OverflowMenuItem>
                              <OverflowMenuItem tone="danger" onClick={() => { setUserMenuOpenId(null); setConfirmAction({ type: "delete_user", user }); }}>Delete</OverflowMenuItem>
                            </OverflowMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-md border border-line bg-slate-950/60 p-4">
              {selectedUser ? (
                <div className="grid gap-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{selectedUser.full_name}</p>
                        <p className="break-all text-xs text-slate-500">{selectedUser.email}</p>
                      </div>
                      <Badge>{selectedUser.role}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Created {formatReadableDateTime(selectedUser.created_at)}</p>
                    <p className="mt-1 text-xs text-slate-500">Last login {selectedUser.last_login_at ? formatReadableDateTime(selectedUser.last_login_at) : "Never"}</p>
                  </div>

                  <div className="grid gap-3 border-t border-line pt-4">
                    <label className="grid gap-2 text-sm text-slate-300">
                      Full name
                      <Input value={editForm.full_name} onChange={(event) => setEditForm({ ...editForm, full_name: event.target.value })} />
                    </label>
                    <label className="grid gap-2 text-sm text-slate-300">
                      Email
                      <Input type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
                    </label>
                    <Button variant="secondary" disabled={busy || !editForm.full_name.trim() || !editForm.email.trim()} onClick={saveSelectedUser}>
                      Save User Details
                    </Button>
                  </div>

                  <div className="grid gap-3 border-t border-line pt-4">
                    <label className="grid gap-2 text-sm text-slate-300">
                      New password
                      <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                    </label>
                    <Button variant="secondary" disabled={busy || newPassword.length < 10} onClick={resetSelectedPassword}>
                      <KeyRound className="h-4 w-4" /> Reset Password
                    </Button>
                  </div>

                  <div className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
                    <Button variant="secondary" disabled={busy} onClick={() => setConfirmAction({ type: "clear_history", user: selectedUser })}>
                      <Eraser className="h-4 w-4" /> Clear History
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy || adminUser?.id === selectedUser.id || (selectedUser.role === "admin" && adminCount <= 1)}
                      onClick={() => setConfirmAction({ type: "delete_user", user: selectedUser })}
                    >
                      <Trash2 className="h-4 w-4" /> Delete User
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-72 place-items-center text-center">
                  <div>
                    <UserCog className="mx-auto h-8 w-8 text-cyan" />
                    <p className="mt-3 text-sm font-semibold text-white">Select a user</p>
                    <p className="mt-1 text-xs text-slate-500">Manage profile, password, history, and account access.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
      )}

      {activeTab === "audit" && (
      <div className="mt-5 grid gap-5">
        <Card>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-xl font-bold text-white">Audit Logs</h2>
              <p className="mt-1 text-sm text-slate-500">Search, filter, review, and export recorded administrative activity.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={load}><RefreshCcw className="h-4 w-4" /> Retry Health Check</Button>
              <Button onClick={exportAuditCsv}><Download className="h-4 w-4" /> Export CSV</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_.8fr_.8fr_.75fr_.75fr_.75fr]">
            <label className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <Input className="pl-9" placeholder="Search event, user, details" value={auditFilters.search} onChange={(event) => { setAuditPage(1); setAuditFilters({ ...auditFilters, search: event.target.value }); }} />
            </label>
            <Input placeholder="Event type" value={auditFilters.event} onChange={(event) => { setAuditPage(1); setAuditFilters({ ...auditFilters, event: event.target.value }); }} />
            <Input placeholder="User" value={auditFilters.user} onChange={(event) => { setAuditPage(1); setAuditFilters({ ...auditFilters, user: event.target.value }); }} />
            <AdminSelect label="Status filter" value={auditFilters.status} onChange={(value) => { setAuditPage(1); setAuditFilters({ ...auditFilters, status: value }); }} options={["", "recorded", "failed", "blocked"]} />
            <label className="relative">
              <CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <Input className="pl-9" type="date" value={auditFilters.date_from} onChange={(event) => { setAuditPage(1); setAuditFilters({ ...auditFilters, date_from: event.target.value }); }} aria-label="Audit start date" />
            </label>
            <label className="relative">
              <CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <Input className="pl-9" type="date" value={auditFilters.date_to} onChange={(event) => { setAuditPage(1); setAuditFilters({ ...auditFilters, date_to: event.target.value }); }} aria-label="Audit end date" />
            </label>
          </div>
          <p className="mt-3 text-sm text-slate-500">{filteredLogs.length} audit event{filteredLogs.length === 1 ? "" : "s"} match the current filters.</p>
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-950/70 text-slate-400">
                <tr>
                  <th className="p-3">Event</th>
                  <th className="p-3">User</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6">
                      <SharedEmptyState title="No audit activity found" description="Adjust filters or retry loading audit logs." />
                    </td>
                  </tr>
                )}
                {pagedLogs.map((log) => (
                  <tr key={String(log.id)} className="border-t border-line">
                    <td className="p-3 font-semibold text-white">{securityLabel(String(log.action || "event"))}</td>
                    <td className="break-all p-3 text-slate-300">{String(log.user_email || shortId(String(log.user_id || "System")))}</td>
                    <td className="p-3 font-mono text-xs text-slate-400">{String(log.ip_address || "Not Captured")}</td>
                    <td className="p-3"><StatusChip value={String(log.status || "recorded")} /></td>
                    <td className="p-3 text-slate-400">{formatReadableDateTime(String(log.created_at || ""))}</td>
                    <td className="break-words p-3 text-slate-400">{auditDetails(log)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <Button variant="secondary" disabled={auditPage <= 1} onClick={() => setAuditPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <span className="text-sm text-slate-400">Page {auditPage} of {auditPageCount}</span>
            <Button variant="secondary" disabled={auditPage >= auditPageCount} onClick={() => setAuditPage((value) => Math.min(auditPageCount, value + 1))}>Next</Button>
          </div>
        </Card>
      </div>
      )}
      <ConfirmModal
        open={Boolean(confirmAction)}
        title={confirmTitle(confirmAction)}
        description={confirmDescription(confirmAction)}
        confirmLabel={confirmLabel(confirmAction)}
        tone={confirmAction?.type === "delete_user" ? "danger" : "warning"}
        disabled={busy || (confirmAction?.type === "reject_feedback" && !rejectReason.trim())}
        onCancel={() => setConfirmAction(null)}
        onConfirm={applyConfirmAction}
      >
        {confirmAction?.type === "reject_feedback" && (
          <label className="grid gap-2 text-sm text-slate-300">
            Rejection reason
            <textarea
              className="min-h-28 rounded-md border border-line bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition hover:border-slate-500/60 focus:border-cyan/80 focus:ring-2 focus:ring-cyan/20"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Explain why this feedback should not enter the verified dataset."
            />
          </label>
        )}
      </ConfirmModal>
    </AppShell>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className = normalized === "ok" || normalized === "ready" || normalized === "available"
    ? "border-emerald/40 text-emerald"
    : normalized === "loading"
      ? "border-cyan/40 text-cyan"
      : "border-amber/40 text-amber";
  return <Badge className={className}>{securityLabel(value)}</Badge>;
}

function AdminSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select
      aria-label={label}
      className="h-11 rounded-md border border-line bg-slate-950 px-3 text-sm text-slate-100 outline-none transition hover:border-slate-500/60 focus:border-cyan/80 focus:ring-2 focus:ring-cyan/20"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option || "all"} value={option}>
          {option ? securityLabel(option) : label.startsWith("Role") ? "All Roles" : "All Statuses"}
        </option>
      ))}
    </select>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-slate-950/60 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function MiniDetail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-slate-950/60 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={mono ? "mt-1 break-all font-mono text-sm font-semibold text-white" : "mt-1 text-sm font-semibold text-white"}>{value}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-4 rounded-md border border-dashed border-line bg-slate-950/35 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function HealthRow({
  icon,
  label,
  value,
  status,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  status: string;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-cyan">{icon}</span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="break-words text-sm font-semibold text-white">{value}</p>
          </div>
        </div>
        <StatusBadge value={status} />
      </div>
      {detail && <p className="mt-2 break-words text-xs text-amber-200">{detail}</p>}
    </div>
  );
}

function parseMetrics(metricsJson?: string) {
  if (!metricsJson) return {};
  try {
    return JSON.parse(metricsJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function metricCards(metrics: Record<string, unknown>) {
  const items = [
    ["Accuracy", metrics.accuracy],
    ["Precision", metrics.precision],
    ["Recall", metrics.recall],
    ["F1", metrics.f1],
    ["ROC AUC", metrics.roc_auc],
    ["Dataset", metrics.dataset_size],
    ["False Positives", confusionValue(metrics, "fp")],
    ["False Negatives", confusionValue(metrics, "fn")],
  ];
  const cards = items
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => ({ label: String(label), value: formatMetric(value) }));
  return cards.length ? cards : [{ label: "Status", value: "No metrics yet" }];
}

function metricNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function confusionValue(metrics: Record<string, unknown>, key: "fp" | "fn") {
  const aliases = key === "fp" ? ["fp", "false_positive", "false_positives"] : ["fn", "false_negative", "false_negatives"];
  for (const alias of aliases) {
    if (metrics[alias] !== undefined) return metricNumber(metrics[alias]);
  }
  const matrix = metrics.confusion_matrix;
  if (matrix && typeof matrix === "object" && !Array.isArray(matrix)) {
    const record = matrix as Record<string, unknown>;
    for (const alias of aliases) {
      if (record[alias] !== undefined) return metricNumber(record[alias]);
    }
  }
  return undefined;
}

function formatMetric(value: unknown) {
  if (typeof value === "number") {
    if (value <= 1) return `${Math.round(value * 1000) / 10}%`;
    return String(Math.round(value * 100) / 100);
  }
  return String(value);
}

function auditDetails(log: Record<string, unknown>) {
  const parts = [
    log.entity_type ? securityLabel(String(log.entity_type)) : "",
    log.entity_id ? String(log.entity_id) : "",
  ].filter(Boolean);
  if (parts.length) return parts.join(" - ");
  const metadata = log.metadata;
  if (metadata && typeof metadata === "object") return JSON.stringify(metadata);
  return "Recorded admin event";
}

function shortId(value: string) {
  if (!value || value === "System") return value;
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function filterAuditLogs(
  logs: Array<Record<string, unknown>>,
  filters: { search: string; event: string; user: string; status: string; date_from: string; date_to: string }
) {
  const search = filters.search.trim().toLowerCase();
  const event = filters.event.trim().toLowerCase();
  const user = filters.user.trim().toLowerCase();
  const status = filters.status.trim().toLowerCase();
  const from = filters.date_from ? new Date(`${filters.date_from}T00:00:00`) : null;
  const to = filters.date_to ? new Date(`${filters.date_to}T23:59:59`) : null;

  return logs.filter((log) => {
    const actionValue = String(log.action || "").toLowerCase();
    const userValue = String(log.user_email || log.user_id || "").toLowerCase();
    const statusValue = String(log.status || "recorded").toLowerCase();
    const createdAt = log.created_at ? new Date(String(log.created_at)) : null;
    const searchable = [
      log.action,
      log.user_email,
      log.user_id,
      log.ip_address,
      log.status,
      log.entity_type,
      log.entity_id,
      auditDetails(log),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (search && !searchable.includes(search)) return false;
    if (event && !actionValue.includes(event)) return false;
    if (user && !userValue.includes(user)) return false;
    if (status && statusValue !== status) return false;
    if (from && createdAt && createdAt < from) return false;
    if (to && createdAt && createdAt > to) return false;
    return true;
  });
}

function csvCell(value: string) {
  const text = value.replace(/\r?\n/g, " ");
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function confirmTitle(action: ConfirmAction) {
  if (!action) return "";
  if (action.type === "suspend_user") return action.user.is_active ? "Suspend User" : "Reactivate User";
  if (action.type === "promote_user") return action.user.role === "admin" ? "Demote Admin" : "Promote User";
  if (action.type === "clear_history") return "Clear User History";
  if (action.type === "delete_user") return "Delete User";
  if (action.type === "activate_model") return action.actionLabel;
  if (action.type === "reject_feedback") return "Reject Feedback";
  return "Train New Candidate";
}

function confirmDescription(action: ConfirmAction) {
  if (!action) return "";
  if (action.type === "suspend_user") {
    return action.user.is_active
      ? `${action.user.email} will no longer be able to sign in until reactivated.`
      : `${action.user.email} will regain access to PhishGuard.`;
  }
  if (action.type === "promote_user") {
    return action.user.role === "admin"
      ? `${action.user.email} will lose administrator privileges. This is blocked if they are the last admin.`
      : `${action.user.email} will receive administrator privileges and access to sensitive controls.`;
  }
  if (action.type === "clear_history") return `All saved analyses for ${action.user.email} will be removed. This cannot be undone.`;
  if (action.type === "delete_user") return `${action.user.email} and related account access will be deleted. This cannot be undone.`;
  if (action.type === "activate_model") return `Model version ${action.version} will become the active scoring model for new analyses.`;
  if (action.type === "reject_feedback") return "This feedback will remain out of the verified dataset. Add a short review reason for the audit trail.";
  return "A new candidate model will be trained from approved feedback samples and evaluated before activation.";
}

function confirmLabel(action: ConfirmAction) {
  if (!action) return "Confirm";
  if (action.type === "suspend_user") return action.user.is_active ? "Suspend" : "Reactivate";
  if (action.type === "promote_user") return action.user.role === "admin" ? "Demote" : "Promote";
  if (action.type === "clear_history") return "Clear History";
  if (action.type === "delete_user") return "Delete User";
  if (action.type === "activate_model") return action.actionLabel;
  if (action.type === "reject_feedback") return "Reject Feedback";
  return "Train New Candidate";
}
