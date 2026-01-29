import { AdminDashboardClient } from "./_components/AdminDashboardClient";
import { 
  adminGetDashboardStatsAction, 
  adminGetEnrollmentsStatsAction, 
  adminGetRecentCoursesAction 
} from "./actions";

export const dynamic = 'force-dynamic';

export default async function AdminIndexPage() {
  // 🔹 Fetch initial dashboard data on the server
  const [initialStats, initialEnrollments, initialRecentCourses] = await Promise.all([
    adminGetDashboardStatsAction(),
    adminGetEnrollmentsStatsAction(),
    adminGetRecentCoursesAction(),
  ]);

  return (
    <AdminDashboardClient 
      initialStats={initialStats} 
      initialEnrollments={initialEnrollments} 
      initialRecentCourses={initialRecentCourses} 
    />
  );
}

