import { headers } from "next/headers";
import { LoginForm } from "./_components/LoginForm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AuthErrorHandler from "@/components/AuthErrorHandler";

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    return redirect("/");
  }
  return (
    <>
      <AuthErrorHandler />
      <LoginForm />
    </>
  );
}
