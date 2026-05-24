"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { revalidatePath } from "next/cache";

interface ProfileData {
  name?: string;
  phoneNumber: string;
}

export async function updateProfileAction(
  data: ProfileData,
): Promise<ApiResponse> {
  const t0 = Date.now();
  const user = await requireUser();
  if (process.env.NODE_ENV === "development") {
    console.log(`[updateProfileAction] Start: User=${user.id}`);
  }
  try {
    const dbStart = Date.now();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(data.name && { name: data.name }),
        phoneNumber: data.phoneNumber,
      },
    });
    if (process.env.NODE_ENV === "development") {
      console.log(`[updateProfileAction] DB Update took ${Date.now() - dbStart}ms`);
    }

    revalidatePath("/");
    if (process.env.NODE_ENV === "development") {
      console.log(`[updateProfileAction] Done in ${Date.now() - t0}ms`);
    }
    return {
      status: "success",
      message: "Profile updated successfully",
    };
  } catch {
    return {
      status: "error",
      message: "Failed to update profile",
    };
  }
}

// Keep old action for backwards compatibility
export async function updatePhoneNumberAction(
  phoneNumber: string,
): Promise<ApiResponse> {
  return updateProfileAction({ phoneNumber });
}
