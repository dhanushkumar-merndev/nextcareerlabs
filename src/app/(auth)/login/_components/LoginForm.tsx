"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardTitle,
  CardHeader,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { Loader, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState, useTransition } from "react";
import { toast } from "sonner";
export const GoogleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" {...props}>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
};
export function LoginForm() {
  const router = useRouter();
  const [googlePending, startGoogleTransition] = useTransition();
  const [emailPending, startEmailTransition] = useTransition();
  const [email, setEmail] = useState("");

  async function signInWithGoogle() {
    startGoogleTransition(async () => {
      // If user entered email, check if it's an email-only account
      if (email) {
        try {
          const res = await fetch("/api/auth/check-provider", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const data = await res.json();
          
          if (data.provider === "email") {
            toast.error(
              "This email was registered with OTP. Please use email sign-in."
            );
            return;
          }
        } catch {
          // If check fails, proceed with Google sign-in anyway
        }
      }

      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        fetchOptions: {
          onSuccess: () => {
            toast.success("Signed in with Google, you will be redirected...");
          },
          onError: () => {
            toast.error("Internal Server Error");
          },
        },
      });
    });
  }
async function signInWithEmail() {
  if (!email) {
    toast.error("Please enter your email");
    return;
  }

  startEmailTransition(async () => {
    try {
      // 🔍 STEP 1: Check provider
      const res = await fetch("/api/auth/check-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        toast.error("Unable to verify login method. Please try again.");
        return;
      }

      const data = await res.json();

      // 🔒 Google-only account
      if (data.provider === "google") {
        toast.error(
          "You previously signed in with Google. Please continue with Google sign-in."
        );
        return;
      }

      // ✉️ STEP 2: Send Email OTP
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
        fetchOptions: {
          onSuccess: () => {
            router.push(`/verify-request?email=${email}`);
          },
          onError: (ctx) => {
            const message =
              typeof ctx.error === "string"
                ? ctx.error
                : ctx.error?.message ?? "Failed to send OTP";

            toast.error(message);
          },
        },
      });
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    }
  });
}


  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome Back!</CardTitle>
        <CardDescription>Login with Google or Email account</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          onClick={signInWithGoogle}
          className="w-full"
          variant={"outline"}
          disabled={googlePending}
        >
          {googlePending ? (
            <>
              <Loader className="size-4 animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <GoogleIcon className="size-5" />
              Sign In with Google
            </>
          )}
        </Button>
        <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
          <span className="relative z-10 bg-card px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="m@example.com"
              autoComplete="email"
            />
          </div>
          <Button
            onClick={signInWithEmail}
            disabled={emailPending}
            className="w-full"
          >
            {emailPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <Send className="size-4" />
                Continue with Email
              </>
            )}
          </Button>
        </div>
      </CardContent>
      <div className=" text-balance text-center text-sm text-muted-foreground">
        {" "}
        <Link className="hover:text-primary hover:underline" href="/terms">
          Terms of Service
        </Link>{" "}
        &{" "}
        <Link className="hover:text-primary hover:underline" href="/privacy">
          Privacy Policy
        </Link>
      </div>
    </Card>
  );
}
