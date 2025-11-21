import { Navbar } from "./_components/Navbar";

export default function LayoutUser({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div suppressHydrationWarning>
      <Navbar />
      <main className="container mx-auto mb-32">{children}</main>
    </div>
  );
}
