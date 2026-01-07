"use client";

import { useState, useEffect, useRef } from "react";
import { getThreadMessagesAction, replyToTicketAction, sendNotificationAction, markAsReadAction, resolveTicketAction, submitFeedbackAction, deleteMessageAction, editMessageAction, markThreadAsReadAction, banUserFromSupportAction, resolveThreadAction, hideThreadAction, updateLastSeenAction, toggleMuteAction, getGroupParticipantsAction } from "@/app/data/notifications/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Image as ImageIcon, X, Check, ThumbsUp, Paperclip, Users, BellOff, Bell, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { chatCache } from "@/lib/chat-cache";
import { cn } from "@/lib/utils";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatWindowSkeleton } from "./ChatSkeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { MessageContent } from "./MessageContent";

import { ChevronDown } from "lucide-react";

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
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFetchedId = useRef<string | null>(null);

  // Poll for messages
  useEffect(() => {
    // Reset state when switching threads (only if truly new)
    if (lastFetchedId.current !== threadId) {
        setMessages([]);
        setLoading(true);
        setInputText("");
        setImageUrl(""); 
    }
    
    const fetchWithDedup = async () => {
        // Prevent StrictMode double-fetch or redundant re-fetches
        if (lastFetchedId.current === threadId) return;
        lastFetchedId.current = threadId;
        
        await fetchMessages();
    };
    
    fetchWithDedup();

    // Polling is separate, it can run always but needs to just call fetch
    // We use a separate interval effect or include here?
    // If we include here, cleanup clears interval.
    const interval = setInterval(() => {
        // Polling should always fetch, regardless of dedupe ref (Ref tracks "initial load" basically)
        // But wait, if we update ref on poll? No, ref is for "init on change".
        fetchMessages();
    }, 600000); // Poll every 10 mins

    return () => clearInterval(interval);
  }, [threadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    // Check cache
    const cacheKey = `messages_${threadId}`;
    const cached = chatCache.get<any[]>(cacheKey);
    if (cached) {
        setMessages(cached);
        setLoading(false);
        
        // Sync ban status from cache if available
        if (!isGroup) {
            const otherUser = cached.find((m: any) => m.senderId !== currentUserId);
            if (otherUser && otherUser.sender) {
                setIsBanned(!!otherUser.sender.isSupportBanned);
                if (otherUser.sender.lastSeen) {
                    setLastSeen(new Date(otherUser.sender.lastSeen));
                }
            }
        }
        return;
    }

    try {
      const data = await getThreadMessagesAction(threadId);
      setMessages(data);
      chatCache.set(cacheKey, data);
      chatCache.markFetched(); // Mark that we just fetched
      
      // Clear threads cache to update unread counts in sidebar
      chatCache.clear("threads");
      
      setLoading(false);
      
    // Auto-mark thread as read is now handled inside getThreadMessagesAction
    
    // Check for ban status and lastSeen of the other user
    if (!isGroup) {
        const otherUser = data.find((m: any) => m.senderId !== currentUserId);
        if (otherUser && otherUser.sender) {
            setIsBanned(!!otherUser.sender.isSupportBanned);
            if (otherUser.sender.lastSeen) {
                setLastSeen(new Date(otherUser.sender.lastSeen));
            }
        }
    }
    } catch (e) {
      console.error("Failed to fetch messages");
    } finally {
      setLoading(false);
    }
  };


  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !imageUrl) || sending) return;
    
    setSending(true);

    try {
      if (isAdmin && !isGroup) {
         // Determine recipient from the thread (the other person)
         // Usually likely the sender of the first message
         const firstMsg = messages.find(m => m.type === "SUPPORT_TICKET");
         const recipientId = firstMsg?.senderId; 
         
         if (!recipientId) {
             // Fallback: If no support ticket message found, maybe it's a direct message or reply?
             // But if it's NOT a group, we need a recipient.
             // Maybe we can find the "other" user from any message?
             const otherMsg = messages.find(m => m.senderId !== currentUserId);
             if (otherMsg) {
                 await replyToTicketAction({
                    threadId,
                    recipientId: otherMsg.senderId,
                    content: inputText,
                 });
             } else {
                 throw new Error("Recipient not found");
             }
         } else {
             await replyToTicketAction({
                threadId,
                recipientId,
                content: inputText,
             });
         }
      } else {
         // User sending a message OR Admin sending to Group
         await sendNotificationAction({
            title: isAdmin ? "Admin Message" : "Support Message",
            content: inputText,
            type: isGroup ? "GROUP_CHAT" : "SUPPORT_TICKET", // Explicit type
            imageUrl: imageUrl || undefined,
            threadId
         });
      }
      setInputText("");
      setImageUrl("");
      chatCache.clear(`messages_${threadId}`);
      chatCache.clear("threads");
      fetchMessages();
    } catch (error) {
      console.error(error);
      toast.error("Failed to send message");
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
     fetchMessages();
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
          setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content: editContent, imageUrl: editImageUrl || null } : m));
          setIsEditOpen(false);
          setEditingMessageId(null);
          setEditImageUrl("");
          toast.success("Message updated");
      } catch (e) {
          toast.error("Failed to update");
      }
  };

  const handleDelete = async (id: string) => {
      // Optimistic update
      const oldMessages = [...messages];
      setMessages(prev => prev.filter(m => m.id !== id));
      
      try {
          await deleteMessageAction(id);
          chatCache.clear(`messages_${threadId}`);
          chatCache.clear("threads");
          toast.success("Message deleted");
      } catch (e) {
          setMessages(oldMessages);
          toast.error("Failed to delete");
      }
  };

  const submitEdit = async () => {
      if (!editingMessageId || !inputText.trim()) return;
      setSending(true);
      try {
          await editMessageAction(editingMessageId, inputText);
          setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content: inputText } : m));
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
      // We need the recipient ID. 
      // In a 1-on-1 support chat (isAdmin=true, isGroup=false), we find the other user.
      const firstMsg = messages.find(m => m.senderId !== currentUserId);
      const recipientId = firstMsg?.senderId;
      
      if (!recipientId) {
          toast.error("Cannot find user to ban");
          return;
      }

      try {
          const res = await banUserFromSupportAction(recipientId);
          setIsBanned(res.banned);
          toast.success(res.banned ? "User banned from tickets" : "User access restored");
      } catch (e) {
          toast.error("Failed to update ban status");
      }
  };

  const handleResolveThread = async () => {
      try {
          await resolveThreadAction(threadId);
          chatCache.clear(`messages_${threadId}`);
          chatCache.clear("threads");
          toast.success("Thread resolved");
          fetchMessages();
      } catch (e) {
          toast.error("Failed to resolve");
      }
  };

  const handleRemoveChat = async () => {
      try {
          // Optimistic update if prop provided
          if (onRemoveThread) {
              onRemoveThread(threadId);
          }
          
          await hideThreadAction(threadId);
          toast.success("Chat removed from view");
          
          // If no prop (fallback), we might still need the reload or a better way to deselect
          if (!onRemoveThread) {
              window.location.href = isAdmin ? "/admin/notifications" : "/dashboard/notifications";
          }
      } catch (e) {
          toast.error("Failed to remove chat");
      }
  };

  const handleToggleMute = async () => {
      try {
          const result = await toggleMuteAction(threadId);
          setIsMuted(result.muted);
          toast.success(result.muted ? "Chat muted" : "Chat unmuted");
      } catch (e) {
          toast.error("Failed to toggle mute");
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

  // Update last seen on mount and when sending messages
  useEffect(() => {
      updateLastSeenAction().catch(() => {});
  }, [threadId]);


  const displayAvatar = avatarUrl ? (avatarUrl.startsWith("http") || avatarUrl.startsWith("/") ? avatarUrl : useConstructUrl(avatarUrl)) : undefined;

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* HEADER */}
      <div className="p-4 border-b bg-background flex items-center justify-between shadow-sm z-10">
         <div className="flex items-center gap-3">
            <Avatar>
               <AvatarImage src={displayAvatar} />
               <AvatarFallback>{title.slice(0, 2).toUpperCase()}</AvatarFallback> 
               {/* Ideally get thread participant info here */}
            </Avatar>
            <div>
               <h3 className="font-bold text-sm">
                  {title}
               </h3>
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
                      <>
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"/>
                          {isGroup ? "Group" : "Online"}
                      </>
                  )}
               </p>
            </div>
         </div>
         {((isAdmin && !isGroup) || isGroup) && (
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted text-muted-foreground data-[state=open]:bg-muted">
                        <MoreVertical className="h-5 w-5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1">
                    {isGroup && (
                        <DropdownMenuItem onClick={handleShowGroupInfo} className="cursor-pointer py-2 mb-1 rounded-md focus:bg-primary/5">
                            <Info className="h-4 w-4 mr-2" /> 
                            <span className="font-medium">Group Info</span>
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleToggleMute} className="cursor-pointer py-2 mb-1 rounded-md focus:bg-primary/5">
                        {isMuted ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
                        <span className="font-medium">{isMuted ? "Unmute" : "Mute"}</span>
                    </DropdownMenuItem>
                    {!isGroup && isAdmin && (
                        <>
                            <DropdownMenuItem onClick={() => handleResolveThread()} className="cursor-pointer py-2 mb-1 rounded-md focus:bg-green-50 focus:text-green-700">
                                <Check className="h-4 w-4 mr-2 text-green-600" /> 
                                <span className="font-medium">Mark as Resolved</span>
                            </DropdownMenuItem>
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
                    <DropdownMenuItem onClick={() => handleRemoveChat()} className="cursor-pointer py-2 rounded-md focus:bg-destructive/10 text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        <span className="font-medium">Remove Chat</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
             </DropdownMenu>
         )}
      </div>


      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
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
                   <div key={msg.id} className={cn("flex gap-3 max-w-[80%]", isMe ? "ml-auto flex-row-reverse" : "")}>
                       {showAvatar ? (
                          <Avatar className="h-8 w-8 mt-1 border">
                             <AvatarImage src={msg.sender?.image} />
                             <AvatarFallback>{msg.sender?.name?.[0] || "?"}</AvatarFallback>
                          </Avatar>
                       ) : <div className="w-8" />}
                       
                       <div className={cn(
                          "space-y-1 flex flex-col",
                          isMe ? "items-end" : "items-start"
                       )}>
                          {showAvatar && (
                             <span className="text-[10px] text-muted-foreground px-1">
                                {msg.sender?.name || (isMe ? "You" : "User")}
                             </span>
                          )}
                          
                          <div className="flex items-end gap-2 group relative"> 
                             {/* DROPDOWN FOR ME - CHEVRON INSIDE BUBBLE */}
                          
                              <div className={cn(
                                 "px-2.5 py-2.5 rounded-2xl text-sm shadow-sm relative pr-8 group", // Added pr-8 for chevron space
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
                              </div>
                          </div>
                          <span className={cn("text-[10px] text-muted-foreground px-1 block", isMe && "text-right")}>
                             {formatDistanceToNow(new Date(msg.createdAt))}
                          </span>
                          
                          {/* FEEDBACK UI (Only for Users receiving Admin Reply) */}
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
                           {/* RESOLVED INDICATOR */}
                           {msg.resolved && (
                               <div className="flex justify-center w-full">
                                   <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                                       Resolved
                                   </span>
                               </div>
                           )}
                       </div>
                   </div>
                );
             })
         )}
      </div>

      {/* INPUT */}
      {(isAdmin || !isGroup) ? (
        <div className="p-4 bg-background border-t">
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
        <div className="p-4 bg-muted/5 border-t text-center">
            <p className="text-xs text-muted-foreground italic">
                Only admins can send messages in this group.
            </p>
        </div>
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
