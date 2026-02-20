import { adminGetEnrollmentRequests } from "@/app/data/admin/admin-get-requests";
import { RequestsTable } from "./_components/RequestsTable";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";

export const dynamic = 'force-dynamic';

export default async function AdminRequestsPage() {
  // Client Shell: No server-side data fetch to avoid redundant Redis/DB hits.
  // The RequestsTable component will hydrate from LocalStorage or fetch on mount.

  return (
    <div className="flex flex-col gap-4 sm:gap-6 px-4 sm:px-6 py-4 sm:py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Access Requests</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Manage course enrollment requests and user permissions.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-lg sm:text-xl">Enrollment Requests</CardTitle>
          <CardDescription className="text-sm">
            A list of all users who have requested access to courses.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <RequestsTable initialData={[]} totalCount={0} />
        </CardContent>
      </Card>
    </div>
  );
}
