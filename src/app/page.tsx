"use client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/themeToggle";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function Home() {
  const { data: session } = authClient.useSession();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
          toast.success("Signed out successfully");
        },
      },
    });
  }

  return (
    <div className="text-24">
      <ThemeToggle />
      {session ? (
        <div>
          <p>Signed in as {session.user.name}</p>
          <Button onClick={signOut}>Sign out</Button>
        </div>
      ) : (
        <Button>Sign in</Button>
      )}
    </div>
  );
}
