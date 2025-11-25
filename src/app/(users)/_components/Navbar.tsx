"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/themeToggle";
import { UserDropdown } from "./UserDropdown"; // <<— USE YOUR COMPONENT HERE
import { useSignOut } from "@/hooks/use-signout";

export function Navbar() {
  const { data: session, isPending } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(false);
  const handleSignOut = useSignOut();

  const dashboardLink =
    session?.user?.role === "admin" ? "/admin" : "/dashboard";

  const navigationItems = [
    { name: "Home", href: "/" },
    { name: "Courses", href: "/courses" },
    { name: "Dashboard", href: dashboardLink },
  ];

  // Disable scroll when sidebar is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
  }, [isOpen]);

  return (
    <>
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex items-center min-h-16 px-4 mx-auto relative">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="logo" width={32} height={32} />
            <span className="font-medium">Next Career Labs LMS</span>
          </Link>

          {/* Desktop Nav Centered */}
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-8">
            {navigationItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="font-medium hover:text-primary"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Desktop Right */}
          <div className="hidden md:flex items-center gap-2 lg:gap-4 ml-auto">
            <ThemeToggle />

            {!isPending &&
              (session ? (
                <UserDropdown
                  email={session.user.email}
                  name={
                    (session.user.name?.trim() || session.user.email)?.split(
                      "@"
                    )[0]
                  }
                  image={
                    session.user.image ??
                    `https://avatar.vercel.sh/${session.user.email}`
                  }
                />
              ) : (
                <>
                  <Link
                    href="/login"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Login
                  </Link>
                  <Link href="/login" className={buttonVariants()}>
                    Get Started
                  </Link>
                </>
              ))}
          </div>

          {/* Mobile Burger */}
          <button
            className="md:hidden ml-auto p-2 rounded-md border hover:bg-accent"
            onClick={() => setIsOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* MOBILE SIDEBAR BACKDROP */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity ${
          isOpen ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* MOBILE SIDEBAR */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-background border-r z-60 shadow-xl transition-transform duration-300 flex flex-col ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <h2></h2>
          <button
            className="p-2 rounded-md hover:bg-accent"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PROFILE */}
        {session && (
          <div className="flex flex-col items-center py-6 border-b px-4 text-center">
            <Image
              src={
                session.user.image ??
                `https://avatar.vercel.sh/${session.user.email}`
              }
              alt="profile"
              width={70}
              height={70}
              className="rounded-full border"
            />

            {/* NAME */}
            <h3 className="mt-3 text-lg font-semibold">
              {session.user.name?.trim() || session.user.email.split("@")[0]}
            </h3>

            {/* EMAIL */}
            <p className="text-sm text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        )}

        {/* NAV ITEMS */}
        <nav className="flex flex-col mt-4 px-4 space-y-1">
          {navigationItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className="text-[16px] my-1 py-3 px-2 rounded-md hover:bg-accent font-medium"
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* PUSH EVERYTHING UP */}
        <div className="flex-1"></div>

        {/* LOGOUT FIXED AT ABSOLUTE BOTTOM */}
        <div className="px-4 pb-6">
          {session ? (
            <button
              onClick={handleSignOut}
              className={
                buttonVariants({ variant: "destructive" }) +
                " w-full text-center block"
              }
            >
              Logout
            </button>
          ) : (
            <div className="flex flex-col space-y-3">
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className={
                  buttonVariants({ variant: "outline" }) +
                  " w-full text-center block"
                }
              >
                Login
              </Link>
              <Link
                href="/dashboard"
                onClick={() => setIsOpen(false)}
                className={buttonVariants() + " w-full text-center block"}
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
