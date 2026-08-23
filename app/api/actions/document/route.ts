import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession, workflowErrorResponse } from "@/lib/api-guard";
import { performDocumentAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

const VALID = new Set(["upload", "verify"]);

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
    const result = performDocumentAction(getDb(), id, action as "upload" | "verify", guard.session);
    return NextResponse.json(result);
  } catch (e) {
    return workflowErrorResponse(e);
  }
}
