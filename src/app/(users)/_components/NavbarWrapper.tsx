"use client";

import dynamic from "next/dynamic";

export function NavbarSkeleton() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex items-center px-4 min-h-16">
        {/* LEFT: LOGO */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
          <div className="h-4 w-32 rounded bg-muted animate-pulse hidden sm:block" />
        </div>

        {/* CENTER NAV (DESKTOP) */}
        <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-16 rounded bg-muted animate-pulse" />
          ))}
        </div>

        {/* RIGHT (DESKTOP) */}
        <div className="hidden md:flex items-center gap-3 ml-auto">
          <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-20 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
        </div>

        {/* MOBILE */}
        <div className="flex md:hidden ml-auto items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-9 rounded-md bg-muted animate-pulse" />
        </div>
      </div>
    </header>
  );
}

const Navbar = dynamic(() => import("./Navbar").then((mod) => mod.Navbar), {
  ssr: false,
  loading: () => <NavbarSkeleton />,
});

export default function NavbarWrapper() {
  return <Navbar />;
}
