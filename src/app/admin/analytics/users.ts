"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export async function updateUserRole(userId: string, newRole: string) {
  try {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    
    // Authorization check: Only admins can change roles
    // We need to fetch the current user's role from DB or rely on session if it has role
    if (!session?.user?.email) {
       return { success: false, error: "Unauthorized" };
    }

    const currentUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true }
    });

    if (currentUser?.role !== "admin") {
        return { success: false, error: "Forbidden: Only admins can change roles" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    revalidatePath("/admin/analytics/users");
    return { success: true };
  } catch (error) {
    console.error("Error updating user role:", error);
    return { success: false, error: "Failed to update role" };
  }
}
