"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/auth";

const NAV: Array<{ href: string; label: string; icon: string; adminOnly?: boolean }> = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/timeline", label: "Release Timeline", icon: "⧗" },
  { href: "/obligations", label: "Taxes & Obligations", icon: "§" },
  { href: "/transactions", label: "Transactions", icon: "⇄" },
  { href: "/assets", label: "Asset Custody", icon: "◈" },
  { href: "/certificate", label: "Escrow Certificate", icon: "❖" },
  { href: "/audit", label: "Audit Log", icon: "☰" },
  { href: "/admin/users", label: "User Management", icon: "◉", adminOnly: true },
];

export default function Shell({
  user,
  children,
}: {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-[#0b1426]/70 p-4 lg:flex">
        <div className="mb-6 px-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">SCL Escrow Platform</p>
          <h1 className="mt-1 text-sm font-bold leading-snug text-white">Escrow Account & Funds Release Management</h1>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.filter((n) => !n.adminOnly || user.role === "ADMIN").map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-amber-500/15 text-amber-300" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="w-4 text-center text-xs opacity-70">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="mt-0.5 badge bg-sky-500/15 text-sky-300">{user.role.replaceAll("_", " ")}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-amber-500/30 bg-amber-950/60 backdrop-blur">
          <div className="px-4 py-2 text-center text-[12px] font-bold uppercase tracking-widest text-amber-300">
            ⚠ Test / Development Environment — every record on this platform is synthetic test data
          </div>
        </header>

        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b1426]/80 px-4 py-3 lg:hidden">
          <span className="text-sm font-bold text-gold-400">SCL Escrow</span>
          <button onClick={logout} disabled={busy} className="btn-secondary !py-1.5">
            Sign out
          </button>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>

        <footer className="border-t border-white/10 px-6 py-4 text-center text-xs text-slate-500">
          Prototype for a licensed escrow service provider · All balances, taxes, custody records and certificates are
          unverified test records until validated by the institution.
        </footer>
      </div>

      <button
        onClick={logout}
        disabled={busy}
        className="btn-secondary fixed bottom-4 right-4 z-30 hidden lg:inline-flex"
      >
        Sign out ({user.email})
      </button>
    </div>
  );
}
