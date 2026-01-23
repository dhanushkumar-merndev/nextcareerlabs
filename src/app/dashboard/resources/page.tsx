
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ChatLayoutLoader } from "@/components/chat/ChatLayoutLoader";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="flex flex-col -mt-6 md:-mb-6 px-4 lg:px-6 h-[calc(100vh-5rem)] md:h-[calc(100vh-4.5rem)]  overflow-hidden">
       {/* Use full height container for chat */}
       <Card className="flex-1 min-h-0 border-0 shadow-none bg-transparent">
        <CardContent className="p-0 h-full min-h-0">
           <div className="rounded-xl border bg-card h-full min-h-0 overflow-hidden shadow-sm">
            <ChatLayoutLoader isAdmin={false} currentUserId={session.user.id} />
         </div>
        </CardContent>
      </Card>
    </div>
  );
}

