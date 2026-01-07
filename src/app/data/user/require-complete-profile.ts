import "server-only";
import { requireUser } from "./require-user";

import { cache } from "react";

export const requireCompleteProfile = cache(async () => {
  const user = await requireUser() as any;

  return {
    user,
    isComplete: !!user.phoneNumber,
  };
});
