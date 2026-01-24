import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { DashboardClient } from "./_components/DashboardClient";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>

      <DashboardClient userId={user.id} />
    </div>
  );
}
