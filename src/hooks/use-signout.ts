"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { setOfflineAction } from "@/app/data/notifications/actions";

export function useSignOut() {
  const router = useRouter();
  const handleSignout = async function signOut() {
    try {
        await setOfflineAction();
    } catch (e) {
        console.error("Failed to set offline status", e);
    }

    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
          toast.success("Signed out successfully");
        },
      },
    });
  };
  return handleSignout;
}
