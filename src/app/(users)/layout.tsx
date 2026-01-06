import { Footer } from "./_components/Footer";
import NavbarWrapper from "./_components/NavbarWrapper";

export default function LayoutUser({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavbarWrapper />
      <main className="container mx-auto mb-32">{children}</main>
      <Footer />
    </>
  );
}
