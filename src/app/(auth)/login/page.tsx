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
import Image from "next/image";
import Link from "next/link";
import React from "react";
import Logo from "@/assets/logo.svg";

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
const LoginPage = () => {
  return (
    <Card>
      <CardHeader className="text-center">
        <Link href="/">
          {" "}
          <Image
            src={Logo}
            alt="Next Career Labs"
            width={32}
            height={32}
            className="mx-auto mb-2 mt-4"
          />
        </Link>
        <CardTitle className="text-xl">Welcome Back!</CardTitle>
        <CardDescription>Login with Google or Email account</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button className="w-full" variant={"outline"}>
          <GoogleIcon className="size-5" />
          Login with Google
        </Button>
        <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
          <span className="relative z-10 bg-card px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="m@example.com" />
          </div>
          <Button className="w-full">Continue with Email</Button>
        </div>
      </CardContent>
      <div className="text-balance text-center text-sm text-muted-foreground">
        By clicking continue, you agree to our{" "}
        <Link className="hover:text-primary hover:underline" href="/terms">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link className="hover:text-primary hover:underline" href="/privacy">
          Privacy Policy
        </Link>
      </div>
    </Card>
  );
};

export default LoginPage;
