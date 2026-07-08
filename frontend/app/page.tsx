"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Database, FileText, Lock, MailWarning, Network, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Section } from "@/components/ui/card";
import { Logo } from "@/components/logo";

const stats = [
  ["Live", "Database-backed history", "Counts come from stored analyses only"],
  ["Verified", "Human-reviewed feedback", "Training samples require admin approval"],
  ["Versioned", "Model registry", "Candidate models must pass quality checks"],
  ["Private", "User-owned data", "Export and deletion controls are built in"]
];

export default function LandingPage() {
  const apiDocsUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/docs`;

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-2 text-sm text-slate-300 hover:text-white">Login</Link>
          <Link href="/register"><Button>Register</Button></Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[78vh] max-w-7xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_.9fr]">
        <div>
          <p className="mb-4 inline-flex rounded-md border border-cyan/30 bg-cyan/10 px-3 py-1 text-sm text-cyan">AI-powered email threat detection with explainable security insights.</p>
          <h1 className="max-w-4xl text-5xl font-black tracking-normal text-white md:text-7xl">PhishGuard</h1>
          <p className="mt-4 max-w-2xl text-xl text-slate-300">Think Before You Click. Analyze messages, headers, links, attachments, and sender identity with a real ML model plus transparent security rules.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/analyzer"><Button><ShieldCheck className="h-4 w-4" /> Analyze an Email</Button></Link>
            <a href={apiDocsUrl}><Button variant="secondary"><FileText className="h-4 w-4" /> API Docs</Button></a>
          </div>
          <p className="mt-4 max-w-2xl text-sm text-slate-500">Remote email content is blocked by default. URLs are checked with a guarded server-side probe that does not execute page scripts.</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <div className="relative overflow-hidden rounded-lg border border-line bg-panel p-6 shadow-glow">
            <div className="absolute inset-x-0 top-0 h-20 animate-scan bg-gradient-to-b from-transparent via-cyan/30 to-transparent" />
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MailWarning className="h-8 w-8 text-amber" />
                <div>
                  <p className="font-semibold text-white">Suspicious email scanner</p>
                  <p className="text-sm text-slate-400">Hybrid ML and rule analysis</p>
                </div>
              </div>
              <span className="rounded-md bg-rose-500/15 px-3 py-1 text-sm text-rose-200">Risk 84</span>
            </div>
            <div className="grid gap-3">
              {["Sender domain mismatch", "Credential request language", "Shortened URL", "Failed DMARC"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-md border border-line bg-slate-950/70 px-4 py-3">
                  <span className="text-sm text-slate-300">{item}</span>
                  <span className="text-xs text-cyan">detected</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <Section>
        <div className="mx-auto grid max-w-7xl gap-4 px-4 md:grid-cols-4">
          {stats.map(([value, label, note]) => (
            <Card key={label}>
              <p className="text-3xl font-black text-white">{value}</p>
              <p className="mt-1 font-semibold text-slate-200">{label}</p>
              <p className="mt-2 text-xs text-slate-500">{note}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mx-auto grid max-w-7xl gap-6 px-4 lg:grid-cols-3">
          {[
            [Network, "URL and domain analysis", "Checks redirects, reachability, HTTPS/TLS, IP URLs, suspicious subdomains, punycode, shorteners, and deceptive link text."],
            [Database, "Real ML pipeline", "Character TF-IDF, word TF-IDF, and engineered security features feed a versioned logistic-regression model."],
            [Lock, "Human-reviewed learning", "User corrections enter an admin queue. Only approved feedback becomes verified training data."]
          ].map(([Icon, title, text]) => (
            <Card key={String(title)}>
              <Icon className="h-7 w-7 text-cyan" />
              <h2 className="mt-4 text-xl font-bold text-white">{String(title)}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{String(text)}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-black text-white">How PhishGuard Works</h2>
            <div className="mt-5 grid gap-3">
              {["Parse safely", "Extract evidence", "Run ML inference", "Score hybrid risk", "Explain recommended action"].map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-md border border-line bg-panel p-4">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-cyan/10 text-sm font-bold text-cyan">{index + 1}</span>
                  <span className="font-medium text-slate-200">{step}</span>
                </div>
              ))}
            </div>
          </div>
          <Card>
            <Sparkles className="h-8 w-8 text-amber" />
            <h2 className="mt-4 text-2xl font-bold text-white">Privacy by design</h2>
            <p className="mt-3 text-slate-400">Uploaded files are parsed for metadata and evidence only. Attachments are never executed, remote images are blocked, and users can delete or export their own data.</p>
            <Link href="/register" className="mt-6 inline-flex"><Button>Start Analysis <ArrowRight className="h-4 w-4" /></Button></Link>
          </Card>
        </div>
      </Section>

      <footer className="border-t border-line py-8 text-center text-sm text-slate-500">
        PhishGuard provides automated guidance and may produce false positives or false negatives.
      </footer>
    </main>
  );
}
