"use server";

import { adminGetCourses } from "@/app/data/admin/admin-get-courses";

export async function adminGetCoursesAction(
    clientVersion?: string,
    cursor?: string | null,
    searchQuery?: string
) {
    return await adminGetCourses(clientVersion, cursor, searchQuery);
}
