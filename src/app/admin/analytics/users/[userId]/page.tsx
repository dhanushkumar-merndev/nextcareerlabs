import { getUserAnalyticsAdmin } from "@/app/admin/analytics/actions";
import { notFound } from "next/navigation";
import { UserAnalyticsClient } from "./_components/UserAnalyticsClient";

interface PageProps {
    params: Promise<{ userId: string }>;
}

export default async function UserAnalyticsPage({ params }: PageProps) {
    const { userId } = await params;
    console.log(`[AdminPage] Accessing User Analytics Profile: ${userId}`);
    
    return (
        <UserAnalyticsClient 
            userId={userId} 
            initialData={undefined} 
        />
    );
}
