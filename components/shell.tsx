"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Milestone,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  Users,
  Vault,
  X,
} from "lucide-react";
import type { Role } from "@/lib/auth";

const NAV: Array<{ href: string; label: string; Icon: typeof LayoutDashboard; adminOnly?: boolean }> = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/timeline", label: "Release Timeline", Icon: Milestone },
  { href: "/obligations", label: "Taxes & Obligations", Icon: ReceiptText },
  { href: "/transactions", label: "Transactions", Icon: ArrowLeftRight },
  { href: "/assets", label: "Asset Custody", Icon: Vault },
  { href: "/certificate", label: "Escrow Certificate", Icon: ScrollText },
  { href: "/audit", label: "Audit Log", Icon: ShieldCheck },
  { href: "/admin/users", label: "User Management", Icon: Users, adminOnly: true },
];

function NavLinks({ user, onNavigate }: { user: { role: Role }; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Escrow portal" className="flex flex-col gap-1">
      {NAV.filter((n) => !n.adminOnly || user.role === "ADMIN").map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-amber-500/15 text-amber-300" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Shell({
  user,
  children,
}: {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Escape closes the menu and returns focus to the toggle.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-[#0b1426]/70 p-4 lg:flex">
        <div className="mb-6 px-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gold-400">SCL Escrow Platform</p>
          <h1 className="mt-1 text-sm font-bold leading-snug text-white">Escrow Account & Funds Release Management</h1>
        </div>
        <NavLinks user={user} />
        <div className="mt-auto space-y-3">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="badge mt-1 bg-sky-500/15 text-sky-300">{user.role.replaceAll("_", " ")}</p>
          </div>
          <button type="button" onClick={logout} disabled={busy} className="btn-secondary w-full">
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Test-data disclosure banner (required control — do not remove) */}
        <header className="sticky top-0 z-30 border-b border-amber-500/30 bg-amber-950/70 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-2 lg:hidden">
            <span className="text-sm font-bold text-gold-400">SCL Escrow</span>
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="btn-secondary !px-2.5 !py-2"
            >
              {menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
            </button>
          </div>
          <p className="px-4 pb-2 text-center text-[12px] font-bold uppercase tracking-widest text-amber-300">
            Test / Development Environment — every record is synthetic test data
          </p>

          {/* Mobile navigation drawer */}
          <div
            id="mobile-nav"
            hidden={!menuOpen}
            className={`border-t border-white/10 bg-[#0b1426]/95 px-4 py-3 lg:hidden ${menuOpen ? "" : ""}`}
          >
            {menuOpen && (
              <div className="space-y-3">
                <NavLinks user={user} onNavigate={() => setMenuOpen(false)} />
                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                    <p className="truncate text-xs text-slate-400">{user.email}</p>
                  </div>
                  <button type="button" onClick={logout} disabled={busy} className="btn-secondary shrink-0 !py-1.5">
                    <LogOut aria-hidden="true" className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 focus:outline-none">
          {children}
        </main>

        <footer className="border-t border-white/10 px-6 py-4 text-center text-xs text-slate-400">
          Prototype for a licensed escrow service provider · All balances, taxes, custody records and certificates are
          unverified test records until validated by the institution.
        </footer>
      </div>
    </div>
  );
}
