"use client";

import Link from "next/link";

import { useState, useEffect, useTransition, useRef } from "react";
import { Bell, Info, MessageSquare, AlertCircle } from "lucide-react";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  getMyNotificationsAction, 
  markAsReadAction, 
  markAllAsReadAction,
} from "@/app/data/notifications/actions";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const fetchNotifications = async () => {
    const data = await getMyNotificationsAction({ unreadOnly: true, take: 10 });
    setNotifications(data);
    setUnreadCount(data.length);
  };

  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
        initialized.current = true;
        fetchNotifications();
    }

    // Poll every 10 minutes for new notifications
    const interval = setInterval(() => {
         fetchNotifications();
    }, 600000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    await markAsReadAction(id);
    fetchNotifications();
  };

  const handleMarkAllAsRead = async () => {
    startTransition(async () => {
      await markAllAsReadAction();
      await fetchNotifications();
      toast.success("All caught up!");
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "SUPPORT_TICKET": return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case "ADMIN_REPLY": return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "BROADCAST": return <Info className="h-4 w-4 text-primary" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative text-blue-500">
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-primary text-[10px] animate-in zoom-in shadow-sm"
              variant="default"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 sm:w-96" align="end" sideOffset={8}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex flex-col">
            <h4 className="text-sm font-semibold">Notifications</h4>
          </div>
          {unreadCount > 0 && (
             <Button 
               variant="ghost" 
               size="sm" 
               className="text-xs h-8"
               onClick={handleMarkAllAsRead}
               disabled={isPending}
             >
               Mark all as read
             </Button>
           )}
        </div>
        
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <Link 
                  key={n.id} 
                  href={(isAdmin ? "/admin/notifications" : "/dashboard/notifications") + (n.threadId ? `?threadId=${n.threadId}` : "")}
                  onClick={() => {
                      setIsOpen(false);
                      // Optimistic Update: Remove from list immediately
                      setNotifications(prev => prev.filter(item => item.id !== n.id));
                      setUnreadCount(prev => Math.max(0, prev - 1));
                      // Server Action
                      handleMarkAsRead(n.id);
                  }}
                >
                    <div 
                      className={cn(
                        "p-4 hover:bg-accent/50 transition-colors relative group block",
                        !n.isRead && "bg-primary/5"
                      )}
                    >
                      <div className="flex gap-3">
                        <div className="mt-1">
                          {getIcon(n.type)}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className={cn("text-sm font-medium", !n.isRead && "text-primary")}>
                              {n.title}
                            </p>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {n.content}
                          </p>
                        </div>
                      </div>
                      {!n.isRead && (
                        <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-2 border-t text-center">
          <Link href={isAdmin ? "/admin/notifications" : "/dashboard/notifications"} className="block w-full">
            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
              View all messages
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
