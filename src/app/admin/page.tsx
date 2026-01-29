import { AdminDashboardClient } from "./_components/AdminDashboardClient";

export const dynamic = 'force-dynamic';

export default async function AdminIndexPage() {
  return <AdminDashboardClient />;
}
