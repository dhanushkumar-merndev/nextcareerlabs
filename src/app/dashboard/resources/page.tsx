
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ChatLayoutLoader } from "@/components/chat/ChatLayoutLoader";

export default async function NotificationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  // Check if user has at least one granted enrollment
  const enrollmentCount = await prisma.enrollment.count({
    where: {
      userId: session.user.id,
      status: "Granted",
    },
  });

  if (enrollmentCount === 0) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] w-full overflow-hidden bg-background -mt-4">
       {/* Use full height container for chat */}
       <div className="flex-1 min-h-0 p-4 md:p-6 h-full"> 
         <div className="rounded-xl border bg-card h-full min-h-0 overflow-hidden shadow-sm">
            <ChatLayoutLoader isAdmin={false} currentUserId={session.user.id} />
         </div>
       </div>
    </div>
  );
}
