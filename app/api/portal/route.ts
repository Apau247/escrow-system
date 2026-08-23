import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPortalData } from "@/lib/portal";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSession();
  if ("error" in guard) return guard.error;
  const db = getDb();
  return NextResponse.json(getPortalData(db));
}
