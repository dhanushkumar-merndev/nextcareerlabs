import { requireUser } from "./require-user";
import type { AuthUser } from "@/lib/types/auth";

import { cache } from "react";

export const requireCompleteProfile = cache(async (): Promise<{
  user: AuthUser;
  isComplete: boolean;
}> => {
  const t0 = Date.now();
  const user = await requireUser();

  if (process.env.NODE_ENV === "development") {
    console.log(`[requireCompleteProfile] Took ${Date.now() - t0}ms`);
  }

  return {
    user,
    isComplete: !!user.phoneNumber,
  };
});
