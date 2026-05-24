import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSession } from "@/lib/types/auth";
import { cache } from "react";

export const requireUser = cache(async () => {
  const t0 = Date.now();
  const session = (await auth.api.getSession({
    headers: await headers(),
  })) as AuthSession | null;

  if (!session) {
    redirect("/login?auth_failure=true");
  }

  if (session.user.banned) {
    redirect("/banned");
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`[requireUser] Session fetch took ${Date.now() - t0}ms`);
  }

  return session.user;
});
