"use server";

import { adminGetDashboardStats } from "@/app/data/admin/admin-get-dashboard-stats";
import { adminGetEnrollmentsStats } from "@/app/data/admin/admin-get-enrollments-stats";
import { adminGetRecentCourses } from "@/app/data/admin/admin-get-recent-course";
import { adminGetDashboardData, AdminDashboardVersions } from "@/app/data/admin/admin-get-dashboard-data";

export async function adminGetDashboardDataAction(clientVersions?: AdminDashboardVersions) {
    console.log(`[AdminAction] Fetching Dashboard Data (Client versions: ${JSON.stringify(clientVersions) || 'none'})`);
    return await adminGetDashboardData(clientVersions);
}

export async function adminGetDashboardStatsAction(clientVersion?: string) {
    console.log(`[AdminAction] Fetching Dashboard Stats (Client version: ${clientVersion || 'none'})`);
    return await adminGetDashboardStats(clientVersion);
}

export async function adminGetEnrollmentsStatsAction(clientVersion?: string) {
    console.log(`[AdminAction] Fetching Enrollments Stats (Client version: ${clientVersion || 'none'})`);
    return await adminGetEnrollmentsStats(clientVersion);
}

export async function adminGetRecentCoursesAction(clientVersion?: string) {
    console.log(`[AdminAction] Fetching Recent Courses (Client version: ${clientVersion || 'none'})`);
    return await adminGetRecentCourses(clientVersion);
}


