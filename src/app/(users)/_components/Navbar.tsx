"use client";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/themeToggle";
import { authClient } from "@/lib/auth-client";
import Image from "next/image";
import Link from "next/link";
import { UserDropdown } from "./UserDropdown";

const navigationItems = [
  { name: "Home", href: "/" },
  { name: "Courses", href: "/courses" },
  { name: "Dashboard", href: "/dashboard" },
];

export function Navbar() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container relative flex min-h-16 items-center mx-auto px-4">
        {/* LEFT — LOGO */}
        <Link href="/" className="flex items-center space-x-2 mr-4">
          <Image
            src="/logo.png"
            alt="logo"
            width={32}
            height={32}
            className="size-8 mr-2"
          />
          <span className="font-medium ml-4">Next Career Labs LMS</span>
        </Link>

        {/* CENTER — NAVIGATION */}
        <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 space-x-8">
          {navigationItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* RIGHT — THEME + USER */}
        <div className="ml-auto hidden md:flex items-center space-x-4">
          <ThemeToggle />

          {isPending ? null : session ? (
            <UserDropdown
              email={session.user.email}
              name={session.user.name}
              image={session.user.image || ""}
            />
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "secondary" })}
              >
                Login
              </Link>
              <Link href="/login" className={buttonVariants()}>
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
