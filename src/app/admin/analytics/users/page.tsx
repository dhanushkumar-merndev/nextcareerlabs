
import { UserList } from "@/app/admin/analytics/_components/UserList";

interface SearchParams {
    search?: string;
}

interface PageProps {
    searchParams: Promise<SearchParams>;
}

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const search = searchParams.search || "";

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Platform Users</h1>
                <p className="text-muted-foreground">
                    Manage all registered users, their roles, and account status.
                </p>
            </div>

            <UserList search={search} />
        </div>
    );
}
