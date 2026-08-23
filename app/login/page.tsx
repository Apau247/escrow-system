"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui";

const DEMO_ACCOUNTS = [
  ["customer@escrow.test", "Customer"],
  ["kendra.anderson@demo.escrow.test", "Customer — Next of Kin"],
  ["agent@escrow.test", "Escrow Agent"],
  ["compliance@escrow.test", "Compliance Officer"],
  ["finance@escrow.test", "Finance Officer"],
  ["admin@escrow.test", "Administrator"],
];

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "mfa">("password");
  const [email, setEmail] = useState("agent@escrow.test");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ code: string; expires_in_seconds: number } | null>(null);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sign-in failed");
      if (!json.mfa_required) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      setChallenge(json.challenge);
      setStep("mfa");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (step !== "mfa") return;
    let alive = true;
    const loadHint = async () => {
      try {
        const res = await fetch(`/api/auth/mfa-hint?email=${encodeURIComponent(email)}`, { cache: "no-store" });
        if (!res.ok) return;
        if (alive) setHint(await res.json());
      } catch {}
    };
    loadHint();
    const t = setInterval(loadHint, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [step, email]);

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "MFA verification failed");
      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-400">SCL Escrow Platform</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Escrow Account & Funds Release Management System</h1>
          <p className="mt-1 text-sm text-slate-400">Regulated institution prototype — sign in with MFA</p>
        </div>

        <div className="card card-pad">
          <Banner tone="amber" title="Test / Development Environment">
            Every record in this system is synthetic test data and must be independently verified before any
            production use.
          </Banner>

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {step === "password" ? (
            <form onSubmit={submitPassword} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Work email
                </label>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Password
                </label>
                <input
                  className="input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Test123!"
                />
              </div>
              <button className="btn-primary w-full" disabled={busy}>
                Continue → MFA
              </button>
            </form>
          ) : (
            <form onSubmit={submitMfa} className="mt-5 space-y-4">
              <p className="text-sm text-slate-300">
                Enter the 6-digit code from your authenticator app for <span className="font-semibold">{email}</span>.
              </p>
              {hint && (
                <div className="rounded-lg border border-dashed border-sky-500/40 bg-sky-500/5 px-3 py-2.5 text-sm">
                  <p className="font-bold text-sky-300">DEVELOPMENT ONLY — live TOTP helper</p>
                  <p className="mono mt-1 text-xl font-bold text-white">{hint.code}</p>
                  <p className="text-xs text-slate-400">expires in ~{hint.expires_in_seconds}s</p>
                </div>
              )}
              <input
                className="input mono text-center text-xl tracking-[0.5em]"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
              />
              <button className="btn-primary w-full" disabled={busy}>
                Verify & Sign In
              </button>
            </form>
          )}
        </div>

        <div className="card mt-4 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Seeded demo accounts</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-slate-300">
            {DEMO_ACCOUNTS.map(([mail, role]) => (
              <li key={mail} className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="mono text-left text-[13px] text-sky-300 hover:underline"
                  onClick={() => {
                    setEmail(mail);
                    setPassword("Test123!");
                    setStep("password");
                  }}
                >
                  {mail}
                </button>
                <span className="badge bg-white/5 text-slate-400">{role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Password for all accounts: Test123! · MFA enforced.</p>
        </div>
      </div>
    </div>
  );
}
