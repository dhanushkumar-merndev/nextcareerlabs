import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSession } from "@/lib/types/auth";
import { cache } from "react";

export const requireAdmin = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  }) as AuthSession | null;

  if (!session) {
    redirect("/login");
  }
  
  const user = session.user;
  if (user.banned) {
    redirect("/banned");
  }

  if (user.role !== "admin") {
    redirect("/not-admin");
  }

  return session;
});
