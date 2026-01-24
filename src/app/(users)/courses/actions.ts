"use server";

import { getAllCourses } from "@/app/data/course/get-all-courses";

export async function getAllCoursesAction(clientVersion?: string, userId?: string) {
    return await getAllCourses(clientVersion, userId);
}
