"use server";

import { adminGetCourses } from "@/app/data/admin/admin-get-courses";

export async function adminGetCoursesAction(
    clientVersion?: string,
    cursor?: string | null,
    searchQuery?: string
) {
    console.log(`[AdminCourseAction] Fetching courses (Search: ${searchQuery || 'none'}, Cursor: ${cursor || 'none'}, ClientVersion: ${clientVersion || 'none'})`);
    return await adminGetCourses(clientVersion, cursor, searchQuery);
}
