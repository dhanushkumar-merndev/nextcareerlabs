"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { chatCache } from "@/lib/chat-cache";

import { toast } from "sonner";


export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleSignout = async function signOut() {
    
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // 1. Clear LocalStorage
          chatCache.invalidate("auth_session");
          chatCache.invalidate("chat_sidebar");

          // 2. Clear React Query Cache
          queryClient.setQueryData(["auth_session"], null);
          queryClient.invalidateQueries({ queryKey: ["auth_session"] });
          
          // 3. Navigate and Hard Refresh
          router.push("/");
          router.refresh();
          toast.success("Signed out successfully");
        },
      },
    });
  };
  return handleSignout;
}
