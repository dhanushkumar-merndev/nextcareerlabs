import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const requireAdmin = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }
  if (session.user.banned) {
    redirect("/banned");
  }

  if (session.user.role !== "admin") {
    redirect("/not-admin");
  }

  return session;
});
