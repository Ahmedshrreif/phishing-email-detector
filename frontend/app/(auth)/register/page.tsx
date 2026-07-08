"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { apiErrorMessage, client, saveTokens } from "@/services/api";

export default function RegisterPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const strength = useMemo(() => {
    let score = 0;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const data = new FormData(event.currentTarget);
    const fullName = String(data.get("full_name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const passwordValue = String(data.get("password") || "");
    const confirm = String(data.get("confirm_password") || "");
    const acceptTerms = data.get("accept_terms") === "on";
    if (passwordValue !== confirm) {
      setMessage("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const response = await client.register({
        full_name: fullName,
        email,
        password: passwordValue,
        accept_terms: acceptTerms
      });
      saveTokens(response);
      router.push("/dashboard");
    } catch (error: unknown) {
      setMessage(apiErrorMessage(error, "Unable to register"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <h1 className="text-2xl font-black text-white">Create your account</h1>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm text-slate-300">Full name<Input name="full_name" autoComplete="name" required /></label>
          <label className="grid gap-2 text-sm text-slate-300">Email<Input name="email" autoComplete="email" type="email" required /></label>
          <label className="grid gap-2 text-sm text-slate-300">
            Password
            <Input name="password" autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <span className="text-xs text-slate-500">Use at least 10 characters with uppercase, lowercase, a number, and a symbol.</span>
          </label>
          <div className="grid grid-cols-5 gap-1" aria-label={`Password strength ${strength} of 5`}>
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className={`h-2 rounded ${index < strength ? "bg-cyan" : "bg-slate-800"}`} />)}
          </div>
          <label className="grid gap-2 text-sm text-slate-300">Confirm password<Input name="confirm_password" autoComplete="new-password" type="password" required /></label>
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input className="mt-1" name="accept_terms" type="checkbox" required />
            I accept the PhishGuard terms and understand automated results can be incorrect.
          </label>
          {message && <p className="rounded-md border border-line bg-white/[0.06] p-3 text-sm text-amber-200">{message}</p>}
          <Button disabled={loading}>{loading ? "Creating account..." : "Register"}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">Already have an account? <Link className="text-cyan" href="/login">Login</Link></p>
      </Card>
    </main>
  );
}
