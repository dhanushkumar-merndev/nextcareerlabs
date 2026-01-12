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
      <NavbarWrapper />
      <main className="flex-1 container mx-auto mb-32">{children}</main>
      <Suspense fallback={<FooterSkeleton />}>
        <Footer />
      </Suspense>
    </div>
  );
}
