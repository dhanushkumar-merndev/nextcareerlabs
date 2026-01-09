import { getAllUsers } from "@/actions/analytics";
import { UserList } from "@/components/admin/UserList";

interface SearchParams {
    search?: string;
}

interface PageProps {
    searchParams: Promise<SearchParams>;
}

export default async function AdminUsersPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const search = searchParams.search || "";
    // Fetch initial data (page 1, limit 100, default role 'user')
    const { users, hasNextPage, totalUsers } = await getAllUsers(search, 1, 100, "user");

    return (
            <div className="flex flex-col gap-6 p-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Platform Users</h1>
                    <p className="text-muted-foreground">
                        Manage all registered users, their roles, and account status.
                    </p>
                </div>

                <UserList 
                    initialUsers={users} 
                    initialHasNextPage={hasNextPage}
                    initialTotalUsers={totalUsers}
                    search={search} 
                />
            </div>
    );
}
