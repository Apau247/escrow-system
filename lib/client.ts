"use client";

import { useCallback, useEffect, useState } from "react";

export interface PortalData {
  escrow: any;
  balances: any;
  stages: any[];
  stageEvents: any[];
  obligations: any[];
  documents: any[];
  certificate: any;
  ledger: any[];
  dualApprovals: any[];
  audit: any[];
  chain: { valid: boolean; entriesChecked: number; firstBrokenAtSeq: number | null };
  anomalies: Array<{ actor_email: string; count: number }>;
  assetFields: {
    physical_asset: string;
    purity: string;
    vault_reference: string;
    custodial_status: string;
  };
  workflowOrder: string[];
}

export function usePortal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/portal", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, error, loading, refresh };
}

export function useMe() {
  const [me, setMe] = useState<{ userId: number; name: string; email: string; role: string } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setMe(j.user))
      .catch(() => setMe(null));
  }, []);
  return me;
}

export async function postAction(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}
