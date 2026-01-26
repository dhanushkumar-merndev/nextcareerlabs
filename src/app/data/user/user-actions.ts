"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { revalidatePath } from "next/cache";

interface ProfileData {
  name?: string;
  phoneNumber: string;
}

export async function updateProfileAction(data: ProfileData): Promise<ApiResponse> {
  const user = await requireUser();

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(data.name && { name: data.name }),
        phoneNumber: data.phoneNumber,
      },
    });

    revalidatePath("/");
    return {
      status: "success",
      message: "Profile updated successfully",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to update profile",
    };
  }
}

// Keep old action for backwards compatibility
export async function updatePhoneNumberAction(phoneNumber: string): Promise<ApiResponse> {
  return updateProfileAction({ phoneNumber });
}
