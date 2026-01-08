"use client";

import { useState, useEffect, useRef } from "react";
import { getThreadMessagesAction, replyToTicketAction, sendNotificationAction, markAsReadAction, resolveTicketAction, submitFeedbackAction, deleteMessageAction, editMessageAction, markThreadAsReadAction, banUserFromSupportAction, resolveThreadAction, hideThreadAction, archiveThreadAction, updateLastSeenAction, toggleMuteAction, getGroupParticipantsAction, deleteThreadMessagesAction, getChatVersionAction, syncChatAction } from "@/app/data/notifications/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Send, Image as ImageIcon, X, Check, ThumbsUp, Paperclip, Users, BellOff, Bell, Info, Archive, Trash2, MoreVertical, Pencil, ChevronDown, CheckCheck, CircleCheckBig, CircleX } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { chatCache } from "@/lib/chat-cache";
import { cn } from "@/lib/utils";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { ChatWindowSkeleton } from "./ChatSkeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageContent } from "./MessageContent";

interface ChatWindowProps {
  threadId: string;
  title: string;
  avatarUrl?: string;
  isGroup?: boolean;
  isAdmin: boolean;
  currentUserId: string;
  onRemoveThread?: (threadId: string) => void;
}

export function ChatWindow({ threadId, title, avatarUrl, isGroup, isAdmin, currentUserId, onRemoveThread }: ChatWindowProps) {
  const queryClient = useQueryClient();
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  // Edit Dialog State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [isEditUploading, setIsEditUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<any[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastThreadId = useRef(threadId);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["messages", threadId],
    queryFn: ({ pageParam }) => getThreadMessagesAction(threadId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const messages = data?.pages.flatMap((page: any) => page.messages) || [];
  const threadState = data?.pages[0]?.state as any;

  // Lightweight version check for real-time updates
  const lastVersionRef = useRef<number | null>(null);
  const { data: chatVersion } = useQuery({
    queryKey: ["chatVersion"],
    queryFn: () => getChatVersionAction(),
    refetchInterval: 30000, // Check every 30 seconds
  });

  useEffect(() => {
    if (chatVersion?.version && chatVersion.version !== lastVersionRef.current) {
        // Only invalidate if version is actually different (new message)
        const isInitial = lastVersionRef.current === null;
        lastVersionRef.current = chatVersion.version;
        
        if (!isInitial) {
            queryClient.invalidateQueries({ queryKey: ["messages"] });
            queryClient.invalidateQueries({ queryKey: ["threads"] });
        }
    }
  }, [chatVersion?.version, queryClient]);

  useEffect(() => {
    // Reset state when switching threads (only if truly new)
    if (lastThreadId.current !== threadId) {
        lastThreadId.current = threadId;
        setInputText("");
        setImageUrl(""); 
        setIsMuted(false);
        setIsArchived(false);
        setIsBanned(false);
        setLastSeen(null);
        setShowGroupInfo(false);
    }
  }, [threadId]);

  useEffect(() => {
    if (threadState) {
        setIsMuted(threadState.isMuted);
        setIsArchived(threadState.isArchived);
    }
    
    // Check for ban status and lastSeen
    if (!isGroup && messages.length > 0) {
        const otherUser = messages.find((m: any) => m.senderId !== currentUserId);
        if (otherUser && otherUser.sender) {
            setIsBanned(!!otherUser.sender.isSupportBanned);
            if (otherUser.sender.lastSeen) {
                setLastSeen(new Date(otherUser.sender.lastSeen));
            }
        }
    }
  }, [messages, threadState, currentUserId, isGroup]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop === 0 && hasNextPage && !isFetchingNextPage) {
        const previousHeight = target.scrollHeight;
        fetchNextPage().then(() => {
            setTimeout(() => {
                target.scrollTop = target.scrollHeight - previousHeight;
            }, 0);
        });
    }
  };

  useEffect(() => {
    if (!loading && messages.length > 0 && !isFetchingNextPage) {
        scrollToBottom();
    }
  }, [loading, threadId, messages.length]); 

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !imageUrl) || sending) return;
    
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
        id: tempId,
        content: inputText,
        imageUrl: imageUrl || null,
        senderId: currentUserId,
        createdAt: new Date().toISOString(),
        status: "sending",
        sender: {
            id: currentUserId,
            name: "You", // Will be corrected on fetch
            image: "" // Will be corrected on fetch
        },
        type: isGroup ? "GROUP_CHAT" : "SUPPORT_TICKET"
    };

    // OPTIMISTIC UPDATE via Query Data would be complex for infinite query
    // Simple approach: show sending state and invalidate on success
    
    
    // UPDATE SIDEBAR INSTANTLY
    window.dispatchEvent(new CustomEvent("chat-thread-update", { 
        detail: { 
            threadId, 
            lastMessage: inputText || "Image attached",
            updatedAt: new Date().toISOString(),
            archived: false
        } 
    }));

    const textToSend = inputText;
    const imgToSend = imageUrl;

    setInputText("");
    setImageUrl("");

    try {
      let result;
      if (isAdmin && !isGroup) {
         const firstMsg = messages.find(m => m.type === "SUPPORT_TICKET");
         const recipientId = firstMsg?.senderId; 
         
         if (!recipientId) {
             const otherMsg = messages.find(m => m.senderId !== currentUserId);
             if (otherMsg) {
                 result = await replyToTicketAction({
                    threadId,
                    recipientId: otherMsg.senderId,
                    content: textToSend,
                 });
             } else {
                 throw new Error("Recipient not found");
             }
         } else {
             result = await replyToTicketAction({
                threadId,
                recipientId,
                content: textToSend,
             });
         }
      } else {
         result = await sendNotificationAction({
            title: isAdmin ? "Admin Message" : "Support Message",
            content: textToSend,
            type: isGroup ? "GROUP_CHAT" : "SUPPORT_TICKET",
            imageUrl: imgToSend || undefined,
            threadId
         });
      }
      
      // Invalidate queries to get fresh data
      queryClient.invalidateQueries({ queryKey: ["messages", threadId] });

      chatCache.clear(`messages_${threadId}`);
      chatCache.clear("threads");
      // fetchMessages(); // Optional: We already updated state, but fetch ensures full sync (e.g. sender info)
    } catch (error) {
      console.error(error);
      toast.error("Failed to send message");
      // Mark as error instead of removing
      // queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
    } finally {
      setSending(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const res = await fetch("/api/s3/upload", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          isImage: true,
        }),
      });

      const { presignedUrl, key } = await res.json();
      
      await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      setImageUrl(key); 
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsEditUploading(true);
    try {
      const res = await fetch("/api/s3/upload", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          isImage: true,
        }),
      });

      const { presignedUrl, key } = await res.json();
      
      await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      setEditImageUrl(key); 
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setIsEditUploading(false);
    }
  };

  const handleResolve = async (id: string, feedback?: string) => {
     if (feedback) {
        await submitFeedbackAction({ notificationId: id, feedback });
     } else {
        await resolveTicketAction(id);
     }
     toast.success("Marked as resolved");
     refetch();
  };

  const handleEditOpen = (msg: any) => {
      setEditingMessageId(msg.id);
      setEditContent(msg.content);
      setEditImageUrl(msg.imageUrl || "");
      setIsEditOpen(true);
  };

  const submitEditDialog = async () => {
      if (!editingMessageId || (!editContent.trim() && !editImageUrl)) return;
      
      try {
          await editMessageAction(editingMessageId, editContent, editImageUrl);
          queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
          setIsEditOpen(false);
          setEditingMessageId(null);
          setEditImageUrl("");
          toast.success("Message updated");
      } catch (e) {
          toast.error("Failed to update");
      }
  };

  const handleDelete = async (id: string) => {
      // Optimistic delete
      
      
      try {
          await deleteMessageAction(id);
          chatCache.clear(`messages_${threadId}`);
          chatCache.clear("threads");
          toast.success("Message deleted");
      } catch (e) {
          queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
          toast.error("Failed to delete");
      }
  };

  const submitEdit = async () => {
      if (!editingMessageId || !inputText.trim()) return;
      setSending(true);
      try {
          await editMessageAction(editingMessageId, inputText);
          queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
          chatCache.clear(`messages_${threadId}`);
          chatCache.clear("threads");
          setEditingMessageId(null);
          setInputText("");
          toast.success("Message updated");
      } catch (e) {
          toast.error("Failed to update");
      } finally {
          setSending(false);
      }
  };

  const handleBanUser = async () => {
      if (isBusy) return;
      setIsBusy(true);

      // We need the recipient ID. 
      // In a 1-on-1 support chat (isAdmin=true, isGroup=false), we find the other user.
      const firstMsg = messages.find(m => m.senderId !== currentUserId);
      const recipientId = firstMsg?.senderId;
      
      if (!recipientId) {
          toast.error("Cannot find user to ban");
          setIsBusy(false);
          return;
      }

      try {
          const res = await banUserFromSupportAction(recipientId);
          setIsBanned(res.banned);
          toast.success(res.banned ? "User banned from tickets" : "User access restored");
      } catch (e) {
          toast.error("Failed to update ban status");
      } finally {
          setIsBusy(false);
      }
  };

  const handleResolveTicket = async (id: string, status: "Resolved" | "Denied" = "Resolved") => {
      if (isBusy) return;
      setIsBusy(true);

      try {
          await resolveTicketAction(id, status);
          chatCache.clear(`messages_${threadId}`);
          chatCache.clear("threads");
          toast.success(status === "Resolved" ? "Ticket resolved" : "Ticket denied");
          refetch();
      } catch (e) {
          toast.error("Failed to update ticket status");
      } finally {
          setIsBusy(false);
      }
  };

  const handleResolveThread = async (status: "Resolved" | "Denied" = "Resolved") => {
      if (isBusy) return;
      setIsBusy(true);

      try {
          await resolveThreadAction(threadId, status);
          chatCache.clear(`messages_${threadId}`);
          chatCache.clear("threads");
          toast.success(status === "Resolved" ? "Thread resolved" : "Thread denied");
          refetch();
      } catch (e) {
          toast.error("Failed to update status");
      } finally {
          setIsBusy(false);
      }
  };

   const handleArchiveChat = async () => {
       if (isBusy) return;
       setIsBusy(true);

       const originalArchived = isArchived;
       const nextArchived = !isArchived;
       
       // OPTIMISTIC UPDATE
       setIsArchived(nextArchived);
       window.dispatchEvent(new CustomEvent("chat-thread-update", { 
           detail: { threadId, archived: nextArchived } 
       }));
       
       try {
           await archiveThreadAction(threadId);
           chatCache.clear(`messages_${threadId}`);
           chatCache.clear("threads");
       } catch (e) {
           // REVERT ON FAILURE
           setIsArchived(originalArchived);
           window.dispatchEvent(new CustomEvent("chat-thread-update", { 
               detail: { threadId, archived: originalArchived } 
           }));
           toast.error("Failed to archive chat");
           console.error("Failed to archive chat", e);
       } finally {
           setIsBusy(false);
       }
   };

   const handleRemoveChat = async () => {
       if (isBusy) return;
       if (!confirm("Are you sure you want to delete all messages in this chat? This cannot be undone.")) return;

       setIsBusy(true);
       try {
           // Optimistic update
           window.dispatchEvent(new CustomEvent("chat-thread-update", { 
               detail: { threadId, hidden: true } 
           }));
           if (onRemoveThread) onRemoveThread(threadId);

           await deleteThreadMessagesAction(threadId); // Now deletes from DB!
           chatCache.clear(`messages_${threadId}`);
           chatCache.clear("threads");
           toast.success("Chat deleted successfully");
       } catch (e: any) {
           toast.error(e.message || "Failed to remove");
           // Trigger refresh to bring it back if optimistic failed
           window.dispatchEvent(new Event("chat-refresh"));
       } finally {
           setIsBusy(false);
       }
   };

   const handleToggleMute = async () => {
       if (isBusy) return;
       setIsBusy(true);

       const originalMuted = isMuted;
       const nextMuted = !isMuted;

       // OPTIMISTIC UPDATE
       setIsMuted(nextMuted);
       window.dispatchEvent(new CustomEvent("chat-thread-update", { 
           detail: { threadId, muted: nextMuted } 
       }));

       try {
           const result = await toggleMuteAction(threadId);
           setIsMuted(result.muted);
           // toast.success(result.muted ? "Chat muted" : "Chat unmuted");
       } catch (e) {
           setIsMuted(originalMuted);
           window.dispatchEvent(new CustomEvent("chat-thread-update", { 
               detail: { threadId, muted: originalMuted } 
           }));
           toast.error("Failed to toggle mute");
       } finally {
           setIsBusy(false);
       }
   };

  const handleShowGroupInfo = async () => {
      if (!isGroup) return;
      try {
          const participants = await getGroupParticipantsAction(threadId);
          setGroupParticipants(participants);
          setShowGroupInfo(true);
      } catch (e) {
          toast.error("Failed to load group info");
      }
  };



  const displayAvatar = avatarUrl ? (avatarUrl.startsWith("http") || avatarUrl.startsWith("/") ? avatarUrl : useConstructUrl(avatarUrl)) : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 bg-muted/20 overflow-hidden">
      {/* HEADER */}
      <div className="p-4 border-b bg-background flex items-center justify-between shadow-sm z-10 shrink-0">
         <div className="flex items-center gap-3">
            {showGroupInfo && (
                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={() => setShowGroupInfo(false)}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
            )}
            <Avatar>
               <AvatarImage src={displayAvatar} />
               <AvatarFallback>{title.slice(0, 2).toUpperCase()}</AvatarFallback> 
            </Avatar>
            <div>
               <h3 className="font-bold text-sm">
                  {showGroupInfo ? "Group Info" : title}
               </h3>
               {!showGroupInfo && (
                   <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {!isGroup && lastSeen ? (
                          (new Date().getTime() - new Date(lastSeen).getTime()) < 5 * 60 * 1000 ? (
                              <>
                                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"/>
                                  Online
                              </>
                          ) : (
                              <>
                                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400"/>
                                  Last seen {formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}
                              </>
                          )
                      ) : (
                          <span className="text-[10px] text-muted-foreground">
                              {isGroup ? "" : "Online"}
                          </span>
                      )}
                   </p>
               )}
               {showGroupInfo && (
                   <p className="text-[10px] text-muted-foreground">
                       {groupParticipants.length} participants
                   </p>
               )}
            </div>
         </div>
         {((isAdmin && !isGroup) || isGroup) && (
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button 
                        disabled={loading || isBusy}
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 hover:bg-muted text-muted-foreground data-[state=open]:bg-muted"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-5 w-5" />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1">
                    {isGroup && (
                        <DropdownMenuItem onClick={handleShowGroupInfo} className="cursor-pointer py-2 mb-1 rounded-md focus:bg-primary/5">
                            <Info className="h-4 w-4 mr-2" /> 
                            <span className="font-medium">Group Info</span>
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem 
                        disabled={isBusy}
                        onClick={handleToggleMute} 
                        className="cursor-pointer py-2 mb-1 rounded-md focus:bg-primary/5"
                    >
                        {isBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : (isMuted ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />)}
                        <span className="font-medium">{isMuted ? "Unmute" : "Mute"}</span>
                    </DropdownMenuItem>
                    {!isGroup && isAdmin && (
                        <>
                            <DropdownMenuItem 
                                onClick={() => handleBanUser()} 
                                className={cn(
                                    "cursor-pointer py-2 rounded-md focus:bg-destructive/10 focus:text-destructive",
                                    isBanned ? "text-green-600 focus:text-green-700 focus:bg-green-50" : "text-destructive"
                                )}
                            >
                                {isBanned ? <Check className="h-4 w-4 mr-2" /> : <X className="h-4 w-4 mr-2" />}
                                <span className="font-medium">{isBanned ? "Unban Ticket Access" : "Ban Ticket Access"}</span>
                            </DropdownMenuItem>
                        </>
                    )}
                    <DropdownMenuItem 
                        disabled={isBusy}
                        onClick={() => handleArchiveChat()} 
                        className="cursor-pointer py-2 rounded-md focus:bg-primary/5"
                    >
                        {isBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
                        <span className="font-medium">{isArchived ? "Unarchive Chat" : "Archive Chat"}</span>
                    </DropdownMenuItem>
                    {!isGroup && (
                        <DropdownMenuItem 
                            disabled={isBusy}
                            onClick={() => handleRemoveChat()} 
                            className="cursor-pointer py-2 rounded-md focus:bg-destructive/10 text-destructive focus:text-destructive"
                        >
                            {isBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                            <span className="font-medium">Delete Chat</span>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
             </DropdownMenu>
         )}
      </div>


      {showGroupInfo ? (
          /* GROUP INFO CONTENT */
          <div data-lenis-prevent className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar bg-background">
              <div className="p-6 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Group Profile Large */}
                  <div className="flex flex-col items-center text-center space-y-3">
                      <Avatar className="h-24 w-24 border-4 border-muted shadow-lg">
                          <AvatarImage src={displayAvatar} />
                          <AvatarFallback className="text-2xl">{title.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                          <h2 className="text-xl font-bold">{title}</h2>
                          <p className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full inline-block">Group · {groupParticipants.length} participants</p>
                      </div>
                  </div>

                  {/* Description/Bio if any - using course name for now */}
                  <div className="space-y-2 px-1">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</h4>
                      <p className="text-sm border rounded-xl p-3 bg-muted/20">
                          This is the official group for <strong>{title}</strong>. 
                          Stay tuned for all important updates, resources, and announcements.
                      </p>
                  </div>

                  {/* Participant List */}
                  <div className="space-y-4 px-1">
                      <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Participants</h4>
                          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{groupParticipants.length} total</span>
                      </div>
                      
                      <div className="space-y-1">
                          {groupParticipants.map((p, i) => (
                              <div key={p.user.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 transition-colors">
                                  <div className="flex items-center gap-3">
                                      <Avatar className="h-10 w-10 border">
                                          <AvatarImage src={p.user.image} />
                                          <AvatarFallback>{p.user.name?.[0] || "?"}</AvatarFallback>
                                      </Avatar>
                                      <div className="flex flex-col">
                                          <span className="text-sm font-semibold">{p.user.name}</span>
                                          <span className="text-[10px] text-muted-foreground">{p.user.email}</span>
                                      </div>
                                  </div>
                                  {p.role === "admin" && (
                                      <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">ADMIN</span>
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>
                  
                  {/* Settings/Info spacer */}
                  <div className="h-10" />
              </div>
          </div>
      ) : (
          <>
            {/* MESSAGES */}
            <div 
              data-lenis-prevent 
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar p-4 space-y-6" 
              ref={scrollRef}
              onScroll={handleScroll}
            >
               {loading ? (
                   <div className="space-y-6 p-4">
                       {[1,2,3].map(i => (
                          <div key={i} className={`flex gap-3 max-w-[80%] ${i % 2 === 0 ? 'ml-auto flex-row-reverse' : ''}`}>
                              <Skeleton className="h-8 w-8 rounded-full" />
                              <div className="space-y-1 w-full">
                                  <Skeleton className={`h-16 w-full rounded-2xl ${i % 2 === 0 ? 'rounded-tr-none' : 'rounded-tl-none'}`} />
                              </div>
                          </div>
                       ))}
                   </div>
               ) : (
                   messages.map((msg, i) => {
                      const isMe = msg.senderId === currentUserId;
                      const showAvatar = i === 0 || messages[i-1].senderId !== msg.senderId;

                      return (
                         <div key={msg.id} className={cn("flex gap-3 max-w-[80%] animate-in fade-in slide-in-from-bottom-2 duration-300", isMe ? "ml-auto flex-row-reverse" : "")}>
                             {showAvatar ? (
                                <Avatar className="h-8 w-8 mt-1 border">
                                   <AvatarImage src={msg.sender?.image} />
                                   <AvatarFallback>{msg.sender?.name?.[0] || "?"}</AvatarFallback>
                                </Avatar>
                             ) : <div className="w-8" />}
                             
                             <div className={cn(
                                "space-y-1 flex flex-col min-w-0 max-w-full",
                                isMe ? "items-end" : "items-start"
                             )}>
                                {showAvatar && (
                                   <span className="text-[10px] text-muted-foreground px-1">
                                      {msg.sender?.name || (isMe ? "You" : "User")}
                                   </span>
                                )}
                                
                                <div className="flex items-end gap-2 group relative"> 
                                   <div className={cn(
                                      "px-2.5 py-2.5 rounded-2xl text-sm shadow-sm relative pr-8 group max-w-full min-w-0 wrap-break-word overflow-hidden",
                                      isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card border rounded-tl-none"
                                   )}>
                                      {/* Chevron Trigger */}
                                      {isMe && !msg.resolved && (
                                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                             <DropdownMenu>
                                               <DropdownMenuTrigger asChild>
                                                 <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full hover:bg-black/10 p-0">
                                                   <ChevronDown className={cn("h-3 w-3", isMe ? "text-primary-foreground/70" : "text-muted-foreground")} />
                                                 </Button>
                                               </DropdownMenuTrigger>
                                               <DropdownMenuContent align="end">
                                                 <DropdownMenuItem onClick={() => handleEditOpen(msg)}>
                                                   <Pencil className="h-3 w-3 mr-2" /> Edit
                                                 </DropdownMenuItem>
                                                 <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(msg.id)}>
                                                   <Trash2 className="h-3 w-3 mr-2" /> Delete
                                                 </DropdownMenuItem>
                                               </DropdownMenuContent>
                                             </DropdownMenu>
                                          </div>
                                      )}

                                      {msg.imageUrl && (
                                         <div className="mb-2 rounded-lg overflow-hidden">
                                            <img 
                                               src={useConstructUrl(msg.imageUrl)} 
                                               alt="attachment" 
                                               className="max-w-full max-h-[300px] w-auto h-auto object-contain bg-muted/50" 
                                            />
                                         </div>
                                      )}
                                      <MessageContent content={msg.content} />
                                      
                                      {isMe && (
                                         <div className="absolute bottom-1 right-1.5 flex items-center">
                                            {msg.status === "sending" ? (
                                               <div className="h-2.5 w-2.5 rounded-full border-b border-r border-current animate-spin opacity-50" />
                                            ) : msg.status === "error" ? (
                                               <CircleX className="h-3 w-3 text-red-400" />
                                            ) : (
                                               <CircleCheckBig className={cn("h-3 w-3", msg.status === "sent" ? "text-green-400" : "text-primary-foreground/50")} />
                                            )}
                                         </div>
                                      )}
                                   </div>
                                </div>
                                <span className={cn("text-[10px] text-muted-foreground px-1 block", isMe && "text-right")}>
                                   {formatDistanceToNow(new Date(msg.createdAt))}
                                </span>
                                
                                {/* FEEDBACK UI etc */}
                                {!isAdmin && !isMe && msg.type === "ADMIN_REPLY" && !msg.resolved && (
                                   <div className="mt-2 bg-background border rounded-lg p-2 space-y-2 w-full">
                                      <p className="text-[10px] font-bold text-center">Is this helpful?</p>
                                      <div className="flex gap-2">
                                         <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => handleResolve(msg.id, "Helpful")}>
                                            <ThumbsUp className="h-3 w-3 mr-1" /> Yes
                                         </Button>
                                         <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] text-orange-600" onClick={() => handleResolve(msg.id, "More Help")}>
                                            No
                                         </Button>
                                      </div>
                                   </div>
                                )}
                                  {/* RESOLVED/DENIED INDICATOR */}
                                  {msg.resolved ? (
                                      <div className="flex justify-center w-full mt-1">
                                          <span className={cn(
                                              "text-[10px] px-2 py-0.5 rounded-full border",
                                              msg.feedback === "Denied" 
                                                  ? "bg-red-50 text-red-700 border-red-200" 
                                                  : "bg-green-50 text-green-700 border-green-200"
                                          )}>
                                              {msg.feedback === "Denied" ? "Denied" : "Resolved"}
                                          </span>
                                      </div>
                                  ) : (
                                      !isMe && isAdmin && msg.type === "SUPPORT_TICKET" && (
                                          <div className="flex gap-2 mt-1 px-1">
                                              <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-6 text-[10px] hover:bg-green-50 hover:text-green-700 border border-transparent hover:border-green-200 rounded-lg px-2"
                                                  onClick={() => handleResolveTicket(msg.id, "Resolved")}
                                              >
                                                  <Check className="h-3 w-3 mr-1" /> Resolve
                                              </Button>
                                              <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-6 text-[10px] hover:bg-red-50 hover:text-red-700 border border-transparent hover:border-red-200 rounded-lg px-2"
                                                  onClick={() => handleResolveTicket(msg.id, "Denied")}
                                              >
                                                  <X className="h-3 w-3 mr-1" /> Deny
                                              </Button>
                                          </div>
                                      )
                                  )}
                             </div>
                         </div>
                      );
                   })
               )}
            </div>

            {/* INPUT */}
            {(isAdmin || !isGroup) ? (
              <div className="p-4 bg-background border-t shrink-0">
                 {imageUrl && (
                    <div className="flex items-center gap-2 mb-2 p-2 bg-muted rounded-lg w-fit">
                       <span className="text-xs text-muted-foreground">Image attached</span>
                       <button onClick={() => setImageUrl("")}><X className="h-4 w-4" /></button>
                    </div>
                 )}
                 <div className="flex items-end gap-2 bg-muted/30 p-2 rounded-xl border focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                    <Button 
                       size="icon" 
                       variant="ghost" 
                       className="h-10 w-10 shrink-0 rounded-full hover:bg-muted"
                       onClick={() => document.getElementById("chat-upload")?.click()}
                       disabled={isUploading || sending}
                    >
                       {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5 text-muted-foreground" />}
                    </Button>
                    <input 
                       id="chat-upload"
                       type="file" 
                       accept="image/*" 
                       className="hidden" 
                       onChange={handleImageUpload}
                    />
                    
                    <Textarea
                       value={inputText}
                       onChange={(e) => setInputText(e.target.value)}
                       onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                             e.preventDefault();
                             handleSendMessage();
                          }
                       }}
                       placeholder="Type a message..."
                       className="min-h-[40px] max-h-[120px] bg-transparent border-0 focus-visible:ring-0 resize-none py-2.5"
                    />
                    
                    <Button 
                       size="icon" 
                       className="h-10 w-10 shrink-0 rounded-full" 
                       disabled={(!inputText.trim() && !imageUrl) || sending || isUploading}
                       onClick={handleSendMessage}
                    >
                       {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </Button>
                 </div>
              </div>
            ) : (
              <div className="p-4 bg-muted/5 border-t text-center shrink-0">
                  <p className="text-xs text-muted-foreground italic">
                      Only admins can send messages in this group.
                  </p>
              </div>
            )}
          </>
      )}
      
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
            <DialogTitle>Edit Message</DialogTitle>
            
            {/* Edit Image Area */}
            {editImageUrl && (
                <div className="relative mb-2 w-fit">
                    <img src={editImageUrl.startsWith("http") || editImageUrl.startsWith("/") ? editImageUrl : useConstructUrl(editImageUrl)} alt="edit attachment" className="h-20 w-auto rounded-md border" />
                    <button 
                        onClick={() => setEditImageUrl("")}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            )}

            <div className="flex flex-col gap-2">
                <Textarea 
                    value={editContent} 
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[100px]"
                    placeholder="Message content..."
                />
                <div className="flex justify-between items-center mt-2">
                     <div className="flex items-center">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => document.getElementById("edit-image-upload")?.click()}
                            disabled={isEditUploading}
                        >
                             {isEditUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                        </Button>
                        <input 
                           id="edit-image-upload" 
                           type="file" 
                           accept="image/*" 
                           className="hidden" 
                           onChange={handleEditImageUpload}
                        />
                     </div>
                     <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                        <Button onClick={submitEditDialog} disabled={isEditUploading}>Save</Button>
                    </div>
                </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
