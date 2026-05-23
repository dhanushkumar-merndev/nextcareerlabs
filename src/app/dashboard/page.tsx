import { DashboardClient } from "./_components/DashboardClient";
import { requireUser } from "../data/user/require-user";
import { DashboardGreeting } from "./_components/DashboardGreeting";
import { getUserDashboardData } from "./actions";

export default async function DashboardPage() {
  const user = await requireUser();
  const dashboardResult = await getUserDashboardData();
  const initialData = dashboardResult && "data" in dashboardResult ? dashboardResult.data : null;
  const initialVersion = dashboardResult && "version" in dashboardResult ? dashboardResult.version : null;

  return (
    <div className="px-4 lg:px-6 pb-10 space-y-6">
      <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
      <DashboardGreeting userName={user.name} />

      <DashboardClient initialData={initialData} initialVersion={initialVersion} userId={user.id} />
    </div>
  );
}
