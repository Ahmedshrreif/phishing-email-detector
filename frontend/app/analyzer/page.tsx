"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, FileUp, Link2, Mail, ScrollText, ShieldCheck, UploadCloud, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { ScannerSteps } from "@/components/scanner-steps";
import { apiErrorMessage, client } from "@/services/api";
import type { Analysis } from "@/types/api";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "paste", label: "Paste Email", icon: Mail },
  { id: "file", label: "Upload File", icon: FileUp },
  { id: "url", label: "Analyze URL", icon: Link2 },
  { id: "headers", label: "Raw Headers", icon: ScrollText }
];

const tabCopy: Record<string, { title: string; description: string; button: string }> = {
  paste: { title: "Email Analyzer", description: "Paste suspicious email details for security analysis.", button: "Analyze Email" },
  file: { title: "File Analyzer", description: "Upload a supported email or document file for security analysis.", button: "Analyze File" },
  url: { title: "URL Analyzer", description: "Analyze one or more suspicious URLs without opening them.", button: "Analyze URLs" },
  headers: { title: "Header Analyzer", description: "Paste raw email headers to inspect routing and authentication signals.", button: "Analyze Headers" },
};

const supportedFileExtensions = [
  "7z",
  "apk",
  "avi",
  "bat",
  "cmd",
  "conf",
  "eml",
  "msg",
  "txt",
  "text",
  "log",
  "md",
  "csv",
  "tsv",
  "json",
  "xml",
  "yaml",
  "yml",
  "ini",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "php",
  "rb",
  "sh",
  "html",
  "htm",
  "svg",
  "pdf",
  "doc",
  "docx",
  "docm",
  "xls",
  "xlsx",
  "xlsm",
  "ppt",
  "pptx",
  "pptm",
  "rtf",
  "odt",
  "ods",
  "odp",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "ico",
  "zip",
  "rar",
  "tar",
  "gz",
  "exe",
  "dll",
  "msi",
  "hta",
  "jar",
  "scr",
  "vbs",
  "ps1",
  "lnk",
  "iso",
  "dmg",
  "img",
  "mp3",
  "wav",
  "mp4",
  "mov",
  "mkv",
  "webm"
];
const supportedFileAccept = supportedFileExtensions.map((ext) => `.${ext}`).join(",");

export default function AnalyzerPage() {
  const router = useRouter();
  const [tab, setTab] = useState("paste");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [form, setForm] = useState({
    sender_name: "",
    sender_email: "",
    reply_to: "",
    subject: "",
    body: "",
    headers: "",
    urls: ""
  });

  const activeCopy = tabCopy[tab];
  const urls = form.urls.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  const invalidUrls = urls.filter((url) => !isValidUrl(url));

  const fileValid = useMemo(() => {
    if (!file) return { ok: false, text: "No file selected" };
    const ext = file.name.toLowerCase().split(".").pop();
    if (!supportedFileExtensions.includes(ext || "")) return { ok: false, text: "Unsupported file type" };
    if (file.size > 10 * 1024 * 1024) return { ok: false, text: "File exceeds 10 MB" };
    return { ok: true, text: `${file.name} - ${(file.size / 1024).toFixed(1)} KB` };
  }, [file]);

  function complete(result: Analysis) {
    sessionStorage.setItem("phishguard.latestAnalysis", JSON.stringify(result));
    router.push(`/analyses/${result.analysis_id}`);
  }

  async function run(action: () => Promise<Analysis>) {
    setLoading(true);
    setMessage("");
    setProgress(0);
    try {
      complete(await action());
    } catch (error: unknown) {
      setMessage(apiErrorMessage(error, "Analysis failed. Your input was preserved so you can correct it and retry."));
    } finally {
      setLoading(false);
    }
  }

  function submitPaste(event: React.FormEvent) {
    event.preventDefault();
    run(() =>
      client.analyzeEmail({
        ...form,
        urls
      })
    );
  }

  function submitUrl(event: React.FormEvent) {
    event.preventDefault();
    if (invalidUrls.length) {
      setMessage(`Invalid URL format: ${invalidUrls[0]}. Add https:// or http:// and try again.`);
      return;
    }
    run(() => client.analyzeUrl(urls));
  }

  function submitHeaders(event: React.FormEvent) {
    event.preventDefault();
    run(() => client.analyzeHeaders(form.headers));
  }

  function submitFile(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !fileValid.ok) {
      setMessage(fileValid.text);
      return;
    }
    run(() => client.analyzeFile(file, setProgress));
  }

  return (
    <AppShell>
      <div className="mx-auto mb-6 max-w-5xl">
        <h1 className="text-3xl font-black text-white">{activeCopy.title}</h1>
        <p className="mt-2 max-w-3xl text-slate-400">{activeCopy.description}</p>
      </div>

      <Card className="mx-auto max-w-5xl p-5 md:p-7">
        <div className="mb-7 grid gap-2 md:grid-cols-4" role="tablist" aria-label="Analyzer input methods">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan",
                  tab === item.id
                    ? "border-cyan/70 bg-cyan text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.18)]"
                    : "border-line bg-slate-950/60 text-slate-300 hover:border-slate-500/60 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "paste" && (
          <form onSubmit={submitPaste} className="mx-auto grid max-w-3xl gap-5">
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-white">Suspicious email details</p>
              <p className="text-sm text-slate-500">Only the core fields are required. Add headers and extra URLs when you have them.</p>
            </div>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              Sender Email
              <Input type="email" value={form.sender_email} onChange={(e) => setForm({ ...form, sender_email: e.target.value })} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              Subject
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-300">
              Email Body
              <Textarea className="min-h-64 resize-y" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
            </label>

            <div className="rounded-md border border-line bg-slate-950/45">
              <button
                type="button"
                onClick={() => setAdvancedOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-200 transition hover:text-white"
                aria-expanded={advancedOpen}
              >
                Advanced Options
                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", advancedOpen && "rotate-180 text-cyan")} />
              </button>
              {advancedOpen && (
                <div className="grid gap-4 border-t border-line p-4">
                  <label className="grid gap-2 text-sm font-medium text-slate-300">
                    Reply-To Email
                    <Input type="email" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-300">
                    Raw Headers
                    <Textarea className="min-h-36 font-mono" value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} />
                    <span className="text-xs font-normal text-slate-500">Use this when headers belong to the complete email above. Use the Raw Headers tab when you only want authentication and routing analysis.</span>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-300">
                    Additional URLs
                    <Textarea className="min-h-28" value={form.urls} onChange={(e) => setForm({ ...form, urls: e.target.value })} placeholder="One URL per line" />
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-center pt-1">
              <Button className="h-[50px] min-w-56 px-8 text-base" disabled={loading}>
                <ShieldCheck className="h-5 w-5" />
                {loading ? "Analyzing email..." : activeCopy.button}
              </Button>
            </div>
          </form>
        )}

        {tab === "file" && (
          <form onSubmit={submitFile} className="grid gap-4">
            <label
              className="grid min-h-60 cursor-pointer place-items-center rounded-lg border border-dashed border-cyan/40 bg-cyan/5 p-8 text-center transition hover:bg-cyan/10"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                setFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <UploadCloud className="h-10 w-10 text-cyan" />
              <span className="mt-3 block text-lg font-semibold text-white">Drop or choose a supported file</span>
              <span className="mt-1 text-sm text-slate-400">Core formats: .eml, .msg, .txt, .pdf. The backend also extracts safe text and metadata from common documents, archives, media, and executable files. Maximum 10 MB. Files are parsed safely, never executed.</span>
              <Input className="sr-only" type="file" accept={supportedFileAccept} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <div className="rounded-md border border-line bg-slate-950/50 p-3">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className={fileValid.ok ? "font-semibold text-emerald" : "font-semibold text-amber"}>{fileValid.text}</p>
                  {file && <p className="mt-1 text-xs text-slate-500">Type: {file.type || "Unknown"} - Size: {(file.size / 1024).toFixed(1)} KB</p>}
                </div>
                {file && <Button type="button" variant="ghost" onClick={() => { setFile(null); setProgress(0); }}><X className="h-4 w-4" /> Remove</Button>}
              </div>
            </div>
            {progress > 0 && <div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-cyan" style={{ width: `${progress}%` }} /></div>}
            <div className="flex justify-center">
              <Button className="h-[50px] min-w-56 px-8 text-base" disabled={loading || !fileValid.ok}>
                <ShieldCheck className="h-5 w-5" />
                {loading ? "Analyzing file..." : activeCopy.button}
              </Button>
            </div>
          </form>
        )}

        {tab === "url" && (
          <form onSubmit={submitUrl} className="mx-auto grid max-w-3xl gap-5">
            <label className="grid gap-2 text-sm font-medium text-slate-300">URLs<Textarea className="min-h-72 font-mono" value={form.urls} onChange={(e) => setForm({ ...form, urls: e.target.value })} placeholder="One URL per line" required /></label>
            {invalidUrls.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <p>{invalidUrls.length} URL {invalidUrls.length === 1 ? "is" : "are"} invalid. URLs must start with http:// or https://.</p>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="h-[50px] min-w-56 px-8 text-base" disabled={loading || urls.length === 0 || invalidUrls.length > 0}>
                <ShieldCheck className="h-5 w-5" />
                {loading ? "Analyzing URLs..." : activeCopy.button}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, urls: "" })}>Clear</Button>
            </div>
          </form>
        )}

        {tab === "headers" && (
          <form onSubmit={submitHeaders} className="mx-auto grid max-w-3xl gap-5">
            <label className="grid gap-2 text-sm font-medium text-slate-300">Raw headers<Textarea className="min-h-80 font-mono" value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} placeholder="Paste the full header block copied from your email client" required /></label>
            <p className="text-sm text-slate-500">In most email clients, open the message details or original source, then copy the full header block into this field.</p>
            <div className="flex justify-center">
              <Button className="h-[50px] min-w-56 px-8 text-base" disabled={loading}>
                <ShieldCheck className="h-5 w-5" />
                {loading ? "Analyzing headers..." : activeCopy.button}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <div className="mx-auto mt-5 max-w-5xl"><ScannerSteps active={loading} /></div>
      {message && <Card className="mx-auto mt-5 max-w-5xl border-amber/40 text-amber-200">{message}</Card>}
    </AppShell>
  );
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
