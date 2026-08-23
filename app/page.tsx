import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionFromCookieHeader } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const store = await cookies();
  const session = getSessionFromCookieHeader(store.toString());
  redirect(session ? "/dashboard" : "/login");
}
