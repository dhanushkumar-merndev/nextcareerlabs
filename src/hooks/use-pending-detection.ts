// hooks/use-pending-detection.ts
import { useQueryClient } from "@tanstack/react-query";
import { chatCache } from "@/lib/chat-cache";

export function usePendingDetection(safeUserId: string | undefined) {
    const queryClient = useQueryClient();

    const triggerIfStatusChanged = (
        oldData: any[],
        newCourses: any[]
    ) => {
        if (!safeUserId) return;

        const oldPendingCount = oldData.filter((c: any) => c.enrollmentStatus === "Pending").length;
        const newPendingCount = newCourses.filter((c: any) => c.enrollmentStatus === "Pending").length;

        if (oldPendingCount > 0 && newPendingCount < oldPendingCount) {
            console.log(`%c[PendingDetection] Status change detected!`, "color: #9333ea; font-weight: bold");
            
            chatCache.invalidateUserDashboardData(safeUserId);
            chatCache.invalidate(`my_courses_${safeUserId}`, safeUserId);

            queryClient.invalidateQueries({
                predicate: (query) => {
                    const key = query.queryKey[0] as string;
                    return key === "user_dashboard" ||
                           key === "my_courses" ||
                           key === "enrolled_courses" ||
                           key === "user_resources" ||
                           key === "chat_sidebar" ||
                           key.startsWith("available_courses");
                }
            });
        }
    };
    const triggerIfSingleStatusChanged = (oldStatus: string | null, newStatus: string | null) => {
    if (oldStatus === "Pending" && newStatus !== "Pending") {
        triggerIfStatusChanged(
            [{ enrollmentStatus: "Pending" }],
            [{ enrollmentStatus: newStatus }]
        );
    }
};

    return { triggerIfStatusChanged, triggerIfSingleStatusChanged };
}