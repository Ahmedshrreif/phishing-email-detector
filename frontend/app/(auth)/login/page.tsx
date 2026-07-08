"use client";

import Link from "next/link";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { apiErrorMessage, client, saveTokens } from "@/services/api";

export default function LoginPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const remember = data.get("remember_me") === "on";
    try {
      const response = await client.login({ email, password, remember_me: remember });
      saveTokens(response);
      router.push("/dashboard");
    } catch (error: unknown) {
      setMessage(apiErrorMessage(error, "Unable to sign in"));
    } finally {
      setLoading(false);
    }
  }

  async function submitForgot() {
    setLoading(true);
    const data = formRef.current ? new FormData(formRef.current) : null;
    const email = String(data?.get("email") || "").trim();
    if (!email) {
      setMessage("Enter your email before requesting a reset.");
      setLoading(false);
      return;
    }
    try {
      const response = await client.forgotPassword(email);
      setMessage(response.message);
    } catch {
      setMessage("Password reset request could not be recorded");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <h1 className="text-2xl font-black text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to analyze emails and review prior reports.</p>
        <form ref={formRef} className="mt-6 grid gap-4" onSubmit={submit}>
          <div className="grid gap-2 text-sm text-slate-300">
            <label htmlFor="login-email">Email</label>
            <Input id="login-email" name="email" autoComplete="email" type="email" required />
          </div>
          <div className="grid gap-2 text-sm text-slate-300">
            <label htmlFor="login-password">Password</label>
            <div className="relative">
              <Input id="login-password" name="password" className="pr-10" autoComplete="current-password" type={show ? "text" : "password"} required />
              <button type="button" className="absolute right-3 top-3 text-slate-400" onClick={() => setShow(!show)} aria-label={show ? "Hide secret" : "Reveal secret"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-300"><input name="remember_me" type="checkbox" /> Remember me</label>
            <button type="button" className="text-cyan hover:text-sky-200" onClick={() => setForgot(!forgot)}>Forgot password</button>
          </div>
          {forgot && (
            <div className="rounded-md border border-line bg-slate-950/70 p-3">
              <p className="text-sm text-slate-400">A reset request is safely recorded for administrator follow-up.</p>
              <Button type="button" className="mt-3 w-full" variant="secondary" onClick={submitForgot}><KeyRound className="h-4 w-4" /> Request reset</Button>
            </div>
          )}
          {message && <p className="rounded-md border border-line bg-white/[0.06] p-3 text-sm text-amber-200">{message}</p>}
          <Button disabled={loading}>{loading ? "Signing in..." : "Login"}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">No account? <Link className="text-cyan" href="/register">Create one</Link></p>
      </Card>
    </main>
  );
}
