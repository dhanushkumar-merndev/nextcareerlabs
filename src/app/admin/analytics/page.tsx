import { AnalyticsClient } from "./_components/AnalyticsClient";
import { getAdminAnalytics } from "./actions";

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  // 🔹 Fetch initial analytics data on the server
  const initialData = await getAdminAnalytics();

  return (
    <div className="flex flex-col gap-4 sm:gap-6 px-4 sm:px-6 py-4 sm:py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Analytics
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Monitor platform performance and course growth metrics.
        </p>
      </div>
      <AnalyticsClient initialData={initialData} />
    </div>
  );
}

