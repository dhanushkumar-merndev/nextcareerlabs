import "server-only";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSession } from "@/lib/types/auth";
import { cache } from "react";

export const requireUser = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  }) as AuthSession | null;

  if (!session) {
    redirect("/login");
  }
  

  if (session.user.banned) {
    redirect("/banned");
  }

  return session.user;
});
