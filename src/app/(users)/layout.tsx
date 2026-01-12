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
      <main className="flex-1 container mx-auto">{children}</main>
      <div className="min-h-[400px]">
        <Suspense fallback={<FooterSkeleton />}>
          <Footer />
        </Suspense>
      </div>
    </div>
  );
}
