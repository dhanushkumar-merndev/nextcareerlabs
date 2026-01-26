/* This is the login page */

import { headers } from "next/headers";
import { LoginForm } from "./_components/LoginForm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
// Ensure page doesnt cache and served as static page
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Get session from auth
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // If session exists, redirect to home page
  if (session) {
    return redirect("/");
  }
  // Render login form
  return <LoginForm />;
}
