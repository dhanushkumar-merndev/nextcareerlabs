import { adminGetEnrollmentRequests } from "@/app/data/admin/admin-get-requests";
import { RequestsTable } from "./_components/RequestsTable";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";

export default async function AdminRequestsPage() {
  const requests = await adminGetEnrollmentRequests(0, 100, "Pending");

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Access Requests</h1>
        <p className="text-muted-foreground">
          Manage course enrollment requests and user permissions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enrollment Requests</CardTitle>
          <CardDescription>
            A list of all users who have requested access to courses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequestsTable initialData={requests as any} />
        </CardContent>
      </Card>
    </div>
  );
}
