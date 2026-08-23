import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession, workflowErrorResponse } from "@/lib/api-guard";
import { STAGE_KEYS, performStageAction, type StageKey } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireSession();
  if ("error" in guard) return guard.error;
  try {
    const body = await req.json();
    const key = String(body?.key ?? "") as StageKey;
    const note = body?.note ? String(body.note).slice(0, 500) : undefined;
    if (!STAGE_KEYS.includes(key)) {
      return NextResponse.json({ error: "Unknown stage." }, { status: 400 });
    }
    const db = getDb();
    const escrow = db.prepare("SELECT id FROM escrow_accounts ORDER BY id LIMIT 1").get() as { id: number };
    const result = performStageAction(db, escrow.id, key, guard.session, note);
    return NextResponse.json(result);
  } catch (e) {
    return workflowErrorResponse(e);
  }
}
