"use client";

import { Download, Eye, EyeOff, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/modal";
import { StatusChip } from "@/components/ui/status-chip";
import { apiErrorMessage, clearTokens, client, currentUser, saveTokens } from "@/services/api";
import { showToast } from "@/lib/toast";
import { downloadBlob } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [apiKeys, setApiKeys] = useState({ safeBrowsing: "", virustotal: "" });
  const [integrationStatus, setIntegrationStatus] = useState({ safeBrowsing: "not_configured", virustotal: "not_configured" });
  const defaultPrefs = { notifications: true, highRiskNotifications: true, systemNotifications: false, privacyMode: false, theme: "dark", retention: "90" };
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [confirmAction, setConfirmAction] = useState<"history" | "account" | null>(null);
  const [deleteText, setDeleteText] = useState("");

  useEffect(() => {
    const user = currentUser();
    if (user) setName(user.full_name);
    const raw = localStorage.getItem("phishguard.preferences");
    if (raw) setPrefs({ ...defaultPrefs, ...JSON.parse(raw) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateProfile() {
    const user = await client.updateProfile(name);
    const access = localStorage.getItem("phishguard.access") || "";
    const refresh = localStorage.getItem("phishguard.refresh") || "";
    saveTokens({ access_token: access, refresh_token: refresh, token_type: "bearer", user });
    setMessage("Profile updated.");
    showToast({ title: "Profile saved", tone: "success" });
  }

  async function changePassword() {
    if (passwords.new_password !== passwords.confirm_password) {
      setMessage("New password and confirmation do not match.");
      return;
    }
    await client.changePassword({ current_password: passwords.current_password, new_password: passwords.new_password });
    setPasswords({ current_password: "", new_password: "", confirm_password: "" });
    setMessage("Password changed.");
    showToast({ title: "Password changed", tone: "success" });
  }

  function savePrefs() {
    const retention = Number(prefs.retention);
    if (!Number.isFinite(retention) || retention < 1 || retention > 3650) {
      setMessage("Retention days must be a number between 1 and 3650.");
      return;
    }
    localStorage.setItem("phishguard.preferences", JSON.stringify(prefs));
    setMessage("Preferences saved locally for this browser.");
    showToast({ title: "Preferences saved", tone: "success" });
  }

  async function exportData() {
    const data = await client.exportPersonalData();
    downloadBlob(JSON.stringify(data, null, 2), "phishguard-personal-data.json", "application/json");
    showToast({ title: "Personal data exported", tone: "success" });
  }

  async function testApiConnections() {
    try {
      const health = (await client.health()) as { optional_reputation_apis?: Record<string, boolean> };
      const apis = health.optional_reputation_apis || {};
      setIntegrationStatus({
        safeBrowsing: apis.safe_browsing ? "connected" : "not_configured",
        virustotal: apis.virustotal ? "connected" : "not_configured",
      });
      setApiKeys({ safeBrowsing: "", virustotal: "" });
      setMessage("Integration status refreshed from the backend health check. API keys were not saved or exposed.");
      showToast({ title: "Integration status refreshed", tone: "success" });
    } catch (error: unknown) {
      const text = apiErrorMessage(error, "Integration status could not be refreshed. Administrator access may be required.");
      setMessage(text);
      showToast({ title: "Integration check failed", description: text, tone: "error" });
    }
  }

  async function confirmDeleteHistory() {
    const result = await client.deleteAllAnalyses();
    setConfirmAction(null);
    setMessage(result.message);
    showToast({ title: "History deleted", description: result.message, tone: "success" });
  }

  async function confirmDeleteAccount() {
    if (deleteText !== "DELETE") {
      setMessage("Type DELETE to confirm account deletion.");
      return;
    }
    await client.deleteAccount();
    clearTokens();
    router.replace("/");
  }

  return (
    <AppShell>
      <div className="mb-6 pt-2 md:pt-4">
        <h1 className="text-3xl font-black text-white">Settings</h1>
        <p className="mt-2 text-slate-400">Manage profile, password, privacy, retention preferences, and personal data.</p>
      </div>
      {message && <Card className="mb-5 border-cyan/30 text-cyan">{message}</Card>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold text-white">Profile</h2>
          <label className="mt-4 grid gap-2 text-sm text-slate-300">Full name<Input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="mt-4 grid gap-2 text-sm text-slate-300">Email<Input value={currentUser()?.email || ""} readOnly className="text-slate-400" /></label>
          <Button className="mt-4" onClick={updateProfile}><Save className="h-4 w-4" /> Save Profile</Button>
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-white">Security</h2>
          <div className="mt-4 grid gap-3">
            <PasswordField label="Current Password" value={passwords.current_password} visible={showPasswords} onChange={(value) => setPasswords({ ...passwords, current_password: value })} />
            <PasswordField label="New Password" value={passwords.new_password} visible={showPasswords} onChange={(value) => setPasswords({ ...passwords, new_password: value })} />
            <PasswordField label="Confirm New Password" value={passwords.confirm_password} visible={showPasswords} onChange={(value) => setPasswords({ ...passwords, confirm_password: value })} />
            <button className="flex w-fit items-center gap-2 text-sm text-cyan hover:text-cyan/80" onClick={() => setShowPasswords((value) => !value)}>
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPasswords ? "Hide passwords" : "Show passwords"}
            </button>
          </div>
          <Button className="mt-4" onClick={changePassword}>Change Password</Button>
          <div className="mt-5 grid gap-2 rounded-md border border-line bg-slate-950/50 p-3 text-sm text-slate-400">
            <p><span className="font-semibold text-slate-200">Two-factor authentication:</span> Two-factor authentication is not available yet.</p>
            <p><span className="font-semibold text-slate-200">Active sessions:</span> Current browser session is active.</p>
            <Button className="w-fit" variant="secondary" onClick={() => { clearTokens(); router.replace("/login"); }}>Logout from All Devices</Button>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-white">Notifications & Appearance</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.notifications} onChange={(e) => setPrefs({ ...prefs, notifications: e.target.checked })} /> Enable local analysis notifications</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.highRiskNotifications} onChange={(e) => setPrefs({ ...prefs, highRiskNotifications: e.target.checked })} /> High-risk result notifications</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.systemNotifications} onChange={(e) => setPrefs({ ...prefs, systemNotifications: e.target.checked })} /> Model or system notifications</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.privacyMode} onChange={(e) => setPrefs({ ...prefs, privacyMode: e.target.checked })} /> Prefer privacy mode for future analyses</label>
            <label className="grid gap-2">Appearance
              <select className="h-11 rounded-md border border-line bg-slate-950 px-3 text-sm text-slate-100 outline-none transition hover:border-slate-500/60 focus:border-cyan/80 focus:ring-2 focus:ring-cyan/20" value={prefs.theme} onChange={(e) => setPrefs({ ...prefs, theme: e.target.value })}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </label>
          </div>
          <Button className="mt-4" variant="secondary" onClick={savePrefs}>Save Preferences</Button>
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-white">API Integrations</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <SecretField label="Google Safe Browsing API Key" value={apiKeys.safeBrowsing} visible={showApiKeys} onChange={(value) => setApiKeys({ ...apiKeys, safeBrowsing: value })} />
            <SecretField label="VirusTotal API Key" value={apiKeys.virustotal} visible={showApiKeys} onChange={(value) => setApiKeys({ ...apiKeys, virustotal: value })} />
            <button className="flex w-fit items-center gap-2 text-sm text-cyan hover:text-cyan/80" onClick={() => setShowApiKeys((value) => !value)}>
              {showApiKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showApiKeys ? "Hide API keys" : "Show API keys"}
            </button>
            <div className="grid gap-2 rounded-md border border-line bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span>Google Safe Browsing</span>
                <StatusChip value={integrationStatus.safeBrowsing} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>VirusTotal</span>
                <StatusChip value={integrationStatus.virustotal} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={testApiConnections}>Test Connection</Button>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-white">Data Retention</h2>
          <p className="mt-2 text-sm text-slate-400">Retention controls how long local preferences request data to be kept. Server-side deletion depends on backend retention jobs.</p>
          <label className="mt-4 grid gap-2 text-sm text-slate-300">Retention Days<Input inputMode="numeric" value={prefs.retention} onChange={(e) => setPrefs({ ...prefs, retention: e.target.value })} /></label>
          <Button className="mt-4" variant="secondary" onClick={savePrefs}>Save Retention</Button>
        </Card>
        <Card>
          <h2 className="text-xl font-bold text-white">Data Controls</h2>
          <p className="mt-2 text-sm text-slate-400">Exporting is reversible. Deleting history or the account is permanent and needs confirmation.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={exportData}><Download className="h-4 w-4" /> Export Personal Data</Button>
            <Button variant="secondary" onClick={() => setConfirmAction("history")}><Trash2 className="h-4 w-4" /> Delete History</Button>
            <Button variant="danger" onClick={() => { setDeleteText(""); setConfirmAction("account"); }}>Delete Account</Button>
          </div>
        </Card>
      </div>
      <ConfirmModal
        open={Boolean(confirmAction)}
        title={confirmAction === "account" ? "Delete account" : "Delete history"}
        description={confirmAction === "account" ? "This permanently deletes your account and stored analysis data. Type DELETE to continue." : "This permanently deletes all analysis history for your account. Reports already downloaded will not be removed."}
        confirmLabel={confirmAction === "account" ? "Delete Account" : "Delete History"}
        tone={confirmAction === "account" ? "danger" : "warning"}
        disabled={confirmAction === "account" && deleteText !== "DELETE"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmAction === "account" ? confirmDeleteAccount : confirmDeleteHistory}
      >
        {confirmAction === "account" && <Input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="Type DELETE" />}
      </ConfirmModal>
    </AppShell>
  );
}

function PasswordField({ label, value, visible, onChange }: { label: string; value: string; visible: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      {label}
      <Input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SecretField({ label, value, visible, onChange }: { label: string; value: string; visible: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      {label}
      <Input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Paste temporarily to test, not saved" />
    </label>
  );
}
