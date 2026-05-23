import { requireUser } from "./require-user";
import type { AuthUser } from "@/lib/types/auth";

import { cache } from "react";

export const requireCompleteProfile = cache(async (): Promise<{
  user: AuthUser;
  isComplete: boolean;
}> => {
  const user = await requireUser();

  return {
    user,
    isComplete: !!user.phoneNumber,
  };
});
