/**
 * LayoutUser
 *
 * Root layout for user-facing pages.
 *
 * - Renders the main navigation bar
 * - Wraps page content inside a responsive container
 * - Lazy-loads the footer with a skeleton fallback
 * - Ensures full-height layout structure
 */

import { Footer, FooterSkeleton } from "./_components/Footer";
import NavbarWrapper from "./_components/NavbarWrapper";
import { Suspense } from "react";

export default function LayoutUser({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top navigation */}
      <NavbarWrapper />

      {/* Main content */}
      <main className="flex-1 container mx-auto">{children}</main>

      {/* Footer (lazy loaded) */}
      <div className="min-h-[400px]">
        <Suspense fallback={<FooterSkeleton />}>
          <Footer />
        </Suspense>
      </div>
    </div>
  );
}
