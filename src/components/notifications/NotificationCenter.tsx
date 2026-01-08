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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { apiThrottle, API_THROTTLE_CONFIG } from "@/lib/api-throttle";


import { useQuery, useQueryClient } from "@tanstack/react-query";

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", "inbox"],
    queryFn: async () => {
        return await getMyNotificationsAction({ unreadOnly: true, take: 10 });
    },
    refetchInterval: 1800000, // 30 minutes
    staleTime: 1800000,       // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Calculate unread count from the fetched data
  // Logic: In a real app, unread count might be separate, but here we filter the list
  // The action returns unreadOnly=true by default in prev code, but we should be careful.
  // Actually the previous code fetched unreadOnly: true. 
  // Let's stick to that.
  const unreadCount = notifications.length;

  const handleMarkAsRead = async (id: string) => {
    // Optimistic Update
    queryClient.setQueryData(["notifications", "inbox"], (old: any[]) => {
        return old ? old.filter(n => n.id !== id) : [];
    });
    
    // Check throttling for non-admin users
    const canCall = isAdmin || apiThrottle.canCall('READ_OPERATIONS', API_THROTTLE_CONFIG.READ_OPERATIONS);

    if (canCall) {
        await markAsReadAction(id);
        if (!isAdmin) apiThrottle.recordCall('READ_OPERATIONS');
    } else {
        console.log("Individual notification read call throttled.");
    }
  };

  const handleMarkAllAsRead = async () => {
    // Optimistic
    queryClient.setQueryData(["notifications", "inbox"], []);
    
    // Check throttling for non-admin users
    const canCall = isAdmin || apiThrottle.canCall('READ_OPERATIONS', API_THROTTLE_CONFIG.READ_OPERATIONS);
    
    if (canCall) {
      startTransition(async () => {
        try {
          await markAllAsReadAction();
          if (!isAdmin) apiThrottle.recordCall('READ_OPERATIONS');
          toast.success("All caught up!");
          queryClient.invalidateQueries({ queryKey: ["notifications", "inbox"] });
        } catch (error) {
          console.error("Failed to mark all as read", error);
        }
      });
    } else {
      // Throttled: UI already updated optimistically, so just show success
      toast.success("All caught up!");
      const nextAvailable = apiThrottle.getTimeUntilNext('READ_OPERATIONS', API_THROTTLE_CONFIG.READ_OPERATIONS);
      console.log(`Notification API call throttled. Next available in ${Math.round(nextAvailable / 1000 / 60)} mins.`);
    }
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
        <Button variant="outline" size="icon" className="relative text-blue-500 hover:bg-muted/50 transition-colors">
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-blue-600 text-[10px] text-white animate-in zoom-in shadow-sm hover:bg-blue-700"
              variant="default"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0 border-muted/40 shadow-2xl bg-background/95 backdrop-blur-xl" align="end" sideOffset={10}>
        <div className="flex items-center justify-between p-4 border-b border-muted/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">Notifications</h4>
            {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                    {unreadCount} new
                </span>
            )}
          </div>
          {unreadCount > 0 && (
             <Button 
               variant="ghost" 
               size="sm" 
               className="text-[10px] h-7 px-2 hover:bg-background/50 hover:text-primary transition-colors"
               onClick={handleMarkAllAsRead}
               disabled={isPending}
             >
               Mark all as read
             </Button>
           )}
        </div>
        
        <div className="max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
          {notifications.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
                <Bell className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No new notifications</p>
              <p className="text-xs text-muted-foreground/60 w-3/4 mx-auto">We'll let you know when something important arrives.</p>
            </div>
          ) : (
            <div className="divide-y divide-muted/20">
              {notifications.map((n: any) => (
                <Link 
                  key={n.id} 
                  href={(isAdmin ? "/admin/notifications" : "/dashboard/notifications") + (n.threadId ? `?threadId=${n.threadId}` : "")}
                  onClick={() => {
                      setIsOpen(false);
                      handleMarkAsRead(n.id);
                  }}
                  className={cn(
                    "flex gap-4 p-4 transition-all hover:bg-muted/40 relative group",
                    !n.isRead ? "bg-blue-50/30 dark:bg-blue-900/10" : "bg-transparent"
                  )}
                >
                    <div className="shrink-0 pt-1">
                        {(!isAdmin && (n.type === "ADMIN_REPLY" || n.type === "SUPPORT_TICKET")) ? (
                            <Avatar className="h-9 w-9 border shadow-sm">
                                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                                    SU
                                </AvatarFallback>
                            </Avatar>
                        ) : n.sender ? (
                            <Avatar className="h-9 w-9 border shadow-sm">
                                <AvatarImage src={n.sender.image} />
                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                    {n.sender.name?.[0]?.toUpperCase() || "?"}
                                </AvatarFallback>
                            </Avatar>
                        ) : (
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center border shadow-sm">
                                {getIcon(n.type)}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                             <p className={cn("text-sm font-semibold truncate", !n.isRead ? "text-foreground" : "text-muted-foreground")}>
                                {(!isAdmin && (n.type === "ADMIN_REPLY" || n.type === "SUPPORT_TICKET")) 
                                    ? "Support Team" 
                                    : (n.sender?.name || (n.type === "BROADCAST" ? "Announcement" : "System"))}
                             </p>
                             <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                             </span>
                        </div>
                        <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">{n.title}</p>
                        <p className={cn("text-xs line-clamp-2 leading-relaxed", !n.isRead ? "text-foreground/90" : "text-muted-foreground")}>
                            {n.content}
                        </p>
                    </div>
                    
                    {!n.isRead && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                        </div>
                    )}
                </Link>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-3 bg-muted/20 border-t border-muted/40 text-center">
          <Link 
            href={isAdmin ? "/admin/notifications" : "/dashboard/notifications"} 
            className="block w-full"
            onClick={() => setIsOpen(false)}
          >
            <Button variant="ghost" size="sm" className="w-full text-xs h-8 hover:bg-background/80 hover:text-primary transition-all">
              See all activity
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
