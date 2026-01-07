"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function updatePhoneNumberAction(phoneNumber: string): Promise<ApiResponse> {
  const user = await requireUser();

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { phoneNumber },
    });

    revalidatePath("/");
    return {
      status: "success",
      message: "Phone number updated successfully",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to update phone number",
    };
  }
}
