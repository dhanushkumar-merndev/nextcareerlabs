"use client";

import { useState } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatWindow } from "./ChatWindow";

import { ArrowLeft, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportTicketDialog } from "@/components/notifications/SupportTicketDialog";

interface ChatLayoutProps {
  isAdmin: boolean;
  currentUserId: string;
}

export function ChatLayout({ isAdmin, currentUserId }: ChatLayoutProps) {
  const [selectedThread, setSelectedThread] = useState<{ id: string; name: string; image?: string; type?: string } | null>(null);
  const [removedThreadIds, setRemovedThreadIds] = useState<string[]>([]);
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  
  const handleRemoveThread = (threadId: string) => {
    setRemovedThreadIds(prev => [...prev, threadId]);
    setSelectedThread(null);
  };
  
  // Custom hook or simple check for mobile
  // For simplicity, using CSS display logic mostly, but state helps for "view" mode
  const isMobile = false; // We can use a real hook, or better, just render conditionally with CSS

  return (
    <div className="flex h-full w-full overflow-hidden bg-background border rounded-xl shadow-sm">
      {/* SIDEBAR - Hidden on mobile if thread selected */}
      <div className={`w-full md:w-[350px] border-r flex flex-col ${selectedThread ? 'hidden md:flex' : 'flex'}`}>
         {/* Sidebar Header with New Ticket Action for Users */}
         {!isAdmin && (
             <div className="p-4 border-b bg-muted/20">
                 <Button className="w-full gap-2" onClick={() => setIsNewTicketOpen(true)}>
                     <MessageSquarePlus className="h-4 w-4" />
                     New Support Ticket
                 </Button>
             </div>
         )}
         <ChatSidebar 
           selectedThreadId={selectedThread?.id || null} 
           onSelectThread={setSelectedThread}
           isAdmin={isAdmin}
         />
      </div>

      {/* CHAT WINDOW - Hidden on mobile if NO thread selected */}
      <div className={`flex-1 flex flex-col ${!selectedThread ? 'hidden md:flex' : 'flex'}`}>
         {selectedThread ? (
            <div className="flex flex-col h-full relative">
               {/* Mobile Back Button Overlay */}
               <div className="md:hidden absolute top-4 left-4 z-20">
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-8 w-8 rounded-full bg-background/80 backdrop-blur"
                    onClick={() => setSelectedThread(null)}
                  >
                     <ArrowLeft className="h-4 w-4" />
                  </Button>
               </div>
               <ChatWindow 
                 threadId={selectedThread.id} 
                 title={selectedThread.name}
                 avatarUrl={selectedThread.image}
                 isGroup={selectedThread.type === "Group"}
                 isAdmin={isAdmin} 
                 currentUserId={currentUserId}
                 onRemoveThread={handleRemoveThread}
               />
            </div>
         ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/10 p-8 text-center">
               <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-4">
                  <MessageSquarePlus className="h-10 w-10 opacity-50" />
               </div>
               <h3 className="text-xl font-bold text-foreground">Select a Conversation</h3>
               <p className="max-w-xs mt-2">
                  Choose a chat from the sidebar to start messaging {isAdmin ? "with a user" : "with support"}.
               </p>
            </div>
         )}
      </div>

      <SupportTicketDialog 
         open={isNewTicketOpen} 
         onOpenChange={setIsNewTicketOpen} 
      />
    </div>
  );
}
