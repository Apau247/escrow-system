import { NextResponse } from "next/server";
import { getSession, type Role, type SessionUser } from "./auth";

export async function requireSession(allowed?: Role[]): Promise<{ session: SessionUser } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }
  if (allowed && !allowed.includes(session.role)) {
    return { error: NextResponse.json({ error: "Insufficient permissions." }, { status: 403 }) };
  }
  return { session };
}

export function workflowErrorResponse(e: unknown): NextResponse {
  if (e instanceof Error && "status" in e) {
    return NextResponse.json({ error: e.message }, { status: (e as any).status });
  }
  console.error(e);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}
