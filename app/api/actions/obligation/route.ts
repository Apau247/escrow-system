import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession, workflowErrorResponse } from "@/lib/api-guard";
import { performObligationAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

const VALID = new Set(["verify", "review", "approve", "authorize"]);

export async function POST(req: NextRequest) {
  const guard = await requireSession();
  if ("error" in guard) return guard.error;
  try {
    const body = await req.json();
    const id = Number(body?.id);
    const action = String(body?.action ?? "");
    if (!Number.isInteger(id) || !VALID.has(action)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const db = getDb();
    const result = performObligationAction(db, id, action as any, guard.session);
    return NextResponse.json(result);
  } catch (e) {
    return workflowErrorResponse(e);
  }
}
