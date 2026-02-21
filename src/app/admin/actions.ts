"use server";

import { adminGetDashboardStats } from "@/app/data/admin/admin-get-dashboard-stats";
import { adminGetEnrollmentsStats } from "@/app/data/admin/admin-get-enrollments-stats";
import { adminGetRecentCourses } from "@/app/data/admin/admin-get-recent-course";
import { adminGetDashboardData, AdminDashboardVersions } from "@/app/data/admin/admin-get-dashboard-data";

export async function adminGetDashboardDataAction(clientVersions?: AdminDashboardVersions) {
    return await adminGetDashboardData(clientVersions);
}

export async function adminGetDashboardStatsAction(clientVersion?: string) {
    return await adminGetDashboardStats(clientVersion);
}

export async function adminGetEnrollmentsStatsAction(clientVersion?: string) {
    return await adminGetEnrollmentsStats(clientVersion);
}

export async function adminGetRecentCoursesAction(clientVersion?: string) {
    return await adminGetRecentCourses(clientVersion);
}


