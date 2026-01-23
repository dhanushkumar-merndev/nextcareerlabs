
import { 
  Card, 
  CardContent, 
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChatLayoutLoader } from "@/components/chat/ChatLayoutLoader";

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex flex-col -mt-6 md:mt-0 md:-mb-1 px-4 lg:px-6 h-[calc(100vh-5rem)] md:h-[calc(100vh-4.5rem)]  overflow-hidden">
      <Card className="flex-1 min-h-0 border-0 shadow-none bg-transparent">
        <CardContent className="p-0 h-full min-h-0">
           <div className="rounded-xl border bg-card h-full min-h-0 overflow-hidden shadow-sm">
             <ChatLayoutLoader isAdmin={true} currentUserId={session.user.id} />
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
