"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, ChevronDown, FileText, History, LogOut, Menu, MessageSquare, Radar, Settings, Shield, UserCircle, UserCog, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToastViewport } from "@/components/ui/toast";
import { Logo } from "@/components/logo";
import { clearTokens, client, currentUser } from "@/services/api";
import { cn } from "@/lib/utils";
import type { User } from "@/types/api";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/analyzer", label: "Analyzer", icon: Radar },
  { href: "/history", label: "History", icon: History },
  { href: "/reports", label: "Reports", icon: FileText }
];

const accountNav = [
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/admin", label: "Admin", icon: UserCog, admin: true }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = currentUser();
    if (storedUser) setUser(storedUser);
    const token = localStorage.getItem("phishguard.access");
    if (!token) {
      router.replace("/login");
      return;
    }
    client.me().then(setUser).catch(() => {
      clearTokens();
      router.replace("/login");
    });
  }, [router]);

  const accountLinks = accountNav.filter((item) => !item.admin || user?.role === "admin");
  const initials = (user?.full_name || user?.email || "User")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  async function logout() {
    try {
      await client.me();
    } catch {}
    clearTokens();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/dashboard" aria-label="PhishGuard dashboard"><Logo /></Link>
          <Button variant="ghost" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {nav.map((item) => <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />)}
          </nav>
          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setAccountOpen((value) => !value)}
              className="flex h-10 items-center gap-2 rounded-md border border-line bg-white/[0.06] px-2.5 text-sm text-slate-200 transition hover:border-slate-500/60 hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
            >
              <span className="grid h-7 w-7 place-items-center rounded-md border border-cyan/30 bg-cyan/10 text-xs font-bold text-cyan">{initials}</span>
              <span className="max-w-36 truncate">{user?.full_name || "Account"}</span>
              <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", accountOpen && "rotate-180")} />
            </button>
            {accountOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-md border border-line bg-slate-950/95 p-2 shadow-glow backdrop-blur" role="menu">
                {accountLinks.map((item) => (
                  <MenuLink key={item.href} item={item} active={pathname.startsWith(item.href)} onClick={() => setAccountOpen(false)} />
                ))}
                <button
                  type="button"
                  onClick={logout}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 p-4 backdrop-blur md:hidden">
          <div className="mb-5 flex items-center justify-between">
            <Logo />
            <Button variant="ghost" onClick={() => setOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></Button>
          </div>
          <nav className="grid gap-2">
            {[...nav, ...accountLinks].map((item) => <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} onClick={() => setOpen(false)} />)}
          </nav>
          <Button className="mt-4 w-full" variant="secondary" onClick={logout}><LogOut className="h-4 w-4" /> Logout</Button>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <ToastViewport />
    </div>
  );
}

function NavLink({ item, active, onClick }: { item: (typeof nav)[number]; active: boolean; onClick?: () => void }) {
  const Icon = item.icon || Shield;
  return (
    <Link
      onClick={onClick}
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white",
        active && "bg-cyan/10 text-cyan"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function MenuLink({ item, active, onClick }: { item: (typeof accountNav)[number]; active: boolean; onClick?: () => void }) {
  const Icon = item.icon || Shield;
  return (
    <Link
      onClick={onClick}
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white",
        active && "bg-cyan/10 text-cyan"
      )}
      role="menuitem"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {item.label}
    </Link>
  );
}
