"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
      const json = await safeJson(res);
      if (!res.ok) throw new Error(typeof json.error === "string" && json.error ? json.error : `HTTP ${res.status}`);
      if (!json || typeof json !== "object") throw new Error("Server returned an invalid response.");
      setData(json as unknown as PortalData);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
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
      .then(safeJson)
      .then((j) => setMe((j.user as typeof me) ?? null))
      .catch(() => setMe(null));
  }, []);
  return me;
}

/** Parses a JSON response, returning {} for empty or malformed bodies. */
export async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function postAction(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await safeJson(res);
  if (!res.ok) {
    const msg = typeof json.error === "string" && json.error ? json.error : `Request failed (${res.status}).`;
    throw new Error(msg);
  }
  return json;
}

export interface ActionFeedback {
  tone: "success" | "error";
  text: string;
}

/**
 * Shared wrapper for workflow actions: prevents duplicate submissions while
 * a request is in flight, surfaces success/failure feedback, and refreshes
 * portal data after completion.
 */
export function useAction(refresh?: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const busyRef = useRef(false);

  const run = useCallback(
    async (url: string, body?: unknown): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setFeedback(null);
      try {
        const json = await postAction(url, body);
        setFeedback({
          tone: "success",
          text: typeof json?.message === "string" && json.message ? json.message : "Action completed successfully.",
        });
        await refresh?.();
        return true;
      } catch (e: unknown) {
        setFeedback({
          tone: "error",
          text: e instanceof Error && e.message ? e.message : "The action could not be completed.",
        });
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );

  const clear = useCallback(() => setFeedback(null), []);

  return { run, busy, feedback, clear };
}
