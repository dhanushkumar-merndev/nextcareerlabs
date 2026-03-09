import { DashboardClient } from "./_components/DashboardClient";
import { requireUser } from "../data/user/require-user";
import { DashboardGreeting } from "./_components/DashboardGreeting";

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="px-4 lg:px-6 pb-10 space-y-6">
      <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
      <DashboardGreeting userName={user.name} />

      <DashboardClient />
    </div>
  );
}
