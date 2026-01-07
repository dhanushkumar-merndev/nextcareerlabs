
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChatLayout } from "@/components/chat/ChatLayout";

export default async function NotificationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] w-full overflow-hidden bg-background -mt-4">
       {/* Use full height container for chat */}
       <div className="flex-1 p-4 md:p-6 h-full"> 
         <div className="rounded-xl border bg-card h-full overflow-hidden shadow-sm">
            <ChatLayout isAdmin={false} currentUserId={session.user.id} />
         </div>
       </div>
    </div>
  );
}
