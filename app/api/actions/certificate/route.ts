import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession, workflowErrorResponse } from "@/lib/api-guard";
import { issueCertificate } from "@/lib/actions";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireSession();
  if ("error" in guard) return guard.error;
  try {
    const result = issueCertificate(getDb(), guard.session);
    return NextResponse.json(result);
  } catch (e) {
    return workflowErrorResponse(e);
  }
}
