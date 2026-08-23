import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionFromCookieHeader } from "@/lib/auth";
import Shell from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = getSessionFromCookieHeader(store.toString());
  if (!session) redirect("/login");

  return (
    <Shell user={{ name: session.name, email: session.email, role: session.role }}>{children}</Shell>
  );
}
