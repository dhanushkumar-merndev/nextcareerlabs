import { Navbar } from "./_components/Navbar";

export default function LayoutUser({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <Navbar />
      <main className="container mx-auto">{children}</main>
    </div>
  );
}
