import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import UsersClient from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // Server-side authorization: non-admins never reach the client component.
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");
  return <UsersClient />;
}
