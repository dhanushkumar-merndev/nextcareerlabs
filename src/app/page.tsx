import { ThemeToggle } from "@/components/ui/themeToggle";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return (
    <div className="text-24">
      <ThemeToggle />
      {session ? <p>Signed in as {session.user.name}</p> : <p>Not signed in</p>}
    </div>
  );
}
