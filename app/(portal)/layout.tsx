import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionFromCookieHeader } from "@/lib/auth";
import { getDb } from "@/lib/db";
import Shell from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = getSessionFromCookieHeader(store.toString());
  if (!session) redirect("/login");

  const userRow = getDb()
    .prepare("SELECT profile_title FROM users WHERE id = ? AND active = 1")
    .get(session.userId) as { profile_title: string | null } | undefined;

  return (
    <Shell
      user={{
        name: session.name,
        email: session.email,
        role: session.role,
        profileTitle: userRow?.profile_title ?? null,
      }}
    >
      {children}
    </Shell>
  );
}
