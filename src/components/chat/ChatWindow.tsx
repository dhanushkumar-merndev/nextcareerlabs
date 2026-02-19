"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { getThreadMessagesAction, replyToTicketAction, sendNotificationAction, resolveTicketAction, submitFeedbackAction, deleteMessageAction, editMessageAction, banUserFromSupportAction, archiveThreadAction, getGroupParticipantsAction, deleteThreadMessagesAction } from "@/app/data/notifications/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Send, Image as ImageIcon, X, Check, ThumbsUp, Paperclip,  Info, Archive, Trash2, MoreVertical, Pencil, ChevronDown,  CircleCheckBig, CircleX, Download } from "lucide-react";
import { formatDistanceToNow, isToday, format } from "date-fns";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageContent } from "./MessageContent";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { chatCache, getSidebarKey, getSidebarLocalKey } from "@/lib/chat-cache";
import { useSmartSession } from "@/hooks/use-smart-session";

interface ChatWindowProps {
    threadId: string;
    title: string;
    avatarUrl?: string;
    isGroup?: boolean;
    isAdmin: boolean;
    currentUserId: string;
    onRemoveThread?: (threadId: string) => void;
    onBack?: () => void;
    externalPresence?: string | null;
}

export function ChatWindow({ threadId, title, avatarUrl, isGroup, isAdmin, currentUserId, onRemoveThread, onBack, externalPresence }: ChatWindowProps) {
    const queryClient = useQueryClient();
    const SIDEBAR_KEY = getSidebarKey(currentUserId, isAdmin);
    const { data: session } = useSmartSession();
    const [inputText, setInputText] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [fileUrl, setFileUrl] = useState("");
    const [fileName, setFileName] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    // Edit Dialog State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editContent, setEditContent] = useState("");
    const [editImageUrl, setEditImageUrl] = useState("");
    const [isEditUploading, setIsEditUploading] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editFileUrl, setEditFileUrl] = useState("");
    const [editFileName, setEditFileName] = useState("");
    const [isEditFileUploading, setIsEditFileUploading] = useState(false);
    const [isBanned, setIsBanned] = useState(false);

    const [isArchived, setIsArchived] = useState(false);
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [groupParticipants, setGroupParticipants] = useState<any[]>([]);
    const [isBusy, setIsBusy] = useState(false);

    // UI REFINEMENTS STATE
    const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [resolvingMessageId, setResolvingMessageId] = useState<string | null>(null);
    const [resolveFeedbackText, setResolveFeedbackText] = useState("");
    const [resolveStatus, setResolveStatus] = useState<"Helpful" | "More Help" | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const lastThreadId = useRef(threadId);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: loading,
        refetch,
    } = useInfiniteQuery({
        queryKey: ["messages", threadId, currentUserId],
        queryFn: async ({ pageParam }) => {
            const result = await getThreadMessagesAction(threadId, pageParam as string | undefined);
            // Only cache the first page (latest messages)
            if (!pageParam && result) {
                chatCache.set(`messages_${threadId}`, result, currentUserId);
            }
            return result;
        },
        initialPageParam: undefined as string | undefined,
        initialData: () => {
            const cached = chatCache.get<any>(`messages_${threadId}`, currentUserId);
            if (cached) {
                return {
                    pages: [cached.data],
                    pageParams: [undefined]
                };
            }
            return undefined;
        },
        getNextPageParam: (lastPage: any) => lastPage.nextCursor,
        staleTime: 1800000, // 30 mins
        gcTime: 21600000, // 6 hours
    });

    const messages = useMemo(() => data?.pages.flatMap((page: any) => page.messages) || [], [data?.pages]);
    const threadState = useMemo(() => data?.pages[0]?.state as any, [data?.pages]);


    useEffect(() => {
        // Reset state when switching threads (only if truly new)
        if (lastThreadId.current !== threadId) {
            lastThreadId.current = threadId;
            setInputText("");
            setImageUrl("");
            setIsArchived(false);
            setIsBanned(false);

            setShowGroupInfo(false);
        }
    }, [threadId]);

    // Read status is now updated during message fetch in getThreadMessagesAction



    useEffect(() => {
        if (threadState) {
            setIsArchived(threadState.isArchived);
        }

        // Check for ban status
        if (!isGroup && messages.length > 0) {
            const otherUser = messages.find((m: any) => m.senderId !== currentUserId);
            if (otherUser && otherUser.sender) {
                setIsBanned(!!otherUser.sender.isSupportBanned);
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
            // Very short delay for DOM render, then instant scroll to prevent flicker
            setTimeout(() => scrollToBottom(true), 50);
        }
    }, [loading, threadId, messages.length]);

    const scrollToBottom = (instant = false) => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({
                behavior: instant ? "auto" : "smooth",
                block: "end"
            });
        } else if (scrollRef.current) {
            // Fallback
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    const handleSendMessage = async () => {
        if (!inputText.trim() && !imageUrl && !fileUrl) return;

        const textToSend = inputText.trim() === "" ? " " : inputText;
        const imgToSend = imageUrl;
        const fUrl = fileUrl;
        const fName = fileName;

        // INSTANTLY CLEAR INPUT AND ATTACHMENTS
        setInputText("");
        setImageUrl("");
        setFileUrl("");
        setFileName("");
        
        // We don't set sending=true here anymore to avoid blocking the UI

        const tempId = `temp-${Date.now()}`;
        const optimisticMessage = {
            id: tempId,
            content: textToSend,
            imageUrl: imgToSend || null,
            fileUrl: fUrl || null,
            fileName: fName || null,
            senderId: currentUserId,
            createdAt: new Date().toISOString(),
            status: "sending",
            sender: {
                id: currentUserId,
                name: session?.user.name || "You",
                image: session?.user.image || ""
            },
            type: isGroup ? "GROUP_CHAT" : "SUPPORT_TICKET"
        };

        // OPTIMISTIC UPDATE via Query Data
        queryClient.setQueryData(["messages", threadId, currentUserId], (oldData: any) => {
            if (!oldData) return oldData;
            const newPages = [...oldData.pages];
            // Add to the first page (latest messages)
            newPages[0] = {
                ...newPages[0],
                messages: [...newPages[0].messages, optimisticMessage]
            };
            return {
                ...oldData,
                pages: newPages
            };
        });

        // UPDATE SIDEBAR INSTANTLY
        window.dispatchEvent(new CustomEvent("chat-thread-update", {
            detail: {
                threadId,
                lastMessage: textToSend.trim() !== "" ? textToSend : (imgToSend ? "Image" : (fUrl ? `PDF (${fName || "Document"})` : "New message")),
                updatedAt: new Date().toISOString(),
                archived: false
            }
        }));

        // GUARANTEE SCROLL TO BOTTOM
        setTimeout(() => scrollToBottom(true), 50);
        setTimeout(() => scrollToBottom(true), 150);

        // BACKGROUND ACTION
        (async () => {
            try {
                let result;
                if (isAdmin && !isGroup) {
                    let recipientId = messages.find(m => m.type === "SUPPORT_TICKET")?.senderId;

                    if (!recipientId) {
                        recipientId = messages.find(m => m.senderId !== currentUserId)?.senderId;
                    }

                    // FALLBACK: Parse from threadId if it's a support ticket (support_USERID)
                    if (!recipientId && threadId.startsWith("support_")) {
                        recipientId = threadId.replace("support_", "");
                    }

                    if (recipientId) {
                        result = await replyToTicketAction({
                            threadId,
                            recipientId,
                            content: textToSend,
                            fileUrl: fUrl || undefined,
                            fileName: fName || undefined
                        });
                    } else {
                        throw new Error("Recipient not found");
                    }
                } else {
                    result = await sendNotificationAction({
                        title: isAdmin ? "Admin Message" : "Support Message",
                        content: textToSend,
                        type: isGroup ? "GROUP_CHAT" : "SUPPORT_TICKET",
                        imageUrl: imgToSend || undefined,
                        fileUrl: fUrl || undefined,
                        fileName: fName || undefined,
                        threadId
                    });
                }

                if (result && !result.success) {
                    // Revert optimistic update
                    queryClient.setQueryData(["messages", threadId, currentUserId], (oldData: any) => {
                        if (!oldData) return oldData;
                        const newPages = [...oldData.pages];
                        newPages[0] = {
                            ...newPages[0],
                            messages: newPages[0].messages.filter((m: any) => m.id !== tempId)
                        };
                        return { ...oldData, pages: newPages };
                    });

                    if ((result as any).error === "TICKET_LIMIT_REACHED") {
                        const mins = (result as any).minutesLeft;
                        const hours = Math.floor(mins / 60);
                        const remainingMins = mins % 60;
                        const timeStr = hours > 0 ? `${hours}h ${remainingMins}m` : `${remainingMins} minutes`;
                        toast.error(`Limit reached. Try again in ${timeStr}!`);
                    } else {
                        toast.error("Failed to send message");
                    }
                    return;
                }

                // Update the optimistic message with the real one
                if (result && result.success && result.notification) {
                    queryClient.setQueryData(["messages", threadId, currentUserId], (oldData: any) => {
                        if (!oldData) return oldData;
                        const newPages = [...oldData.pages];
                        newPages[0] = {
                            ...newPages[0],
                            messages: newPages[0].messages.map((m: any) =>
                                m.id === tempId ? { 
                                    ...result.notification, 
                                    status: "sent",
                                    sender: {
                                        id: currentUserId,
                                        name: session?.user.name || "You",
                                        image: session?.user.image || ""
                                    }
                                } : m
                            )
                        };
                        return { ...oldData, pages: newPages };
                    });
                } else {
                    queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
                }

                chatCache.invalidate(`messages_${threadId}`, currentUserId);
                chatCache.invalidate(getSidebarLocalKey(isAdmin), isAdmin ? undefined : currentUserId);
                queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
                queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });

            } catch (error) {
                toast.error("Failed to send message");
                // Revert on catch
                queryClient.setQueryData(["messages", threadId, currentUserId], (oldData: any) => {
                    if (!oldData) return oldData;
                    const newPages = [...oldData.pages];
                    newPages[0] = {
                        ...newPages[0],
                        messages: newPages[0].messages.filter((m: any) => m.id !== tempId)
                    };
                    return { ...oldData, pages: newPages };
                });
            }
        })();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setUploadProgress(0);
        try {
            const res = await fetch("/api/s3/upload", {
                method: "POST",
                body: JSON.stringify({
                    fileName: file.name,
                    contentType: file.type || "application/pdf",
                    size: file.size,
                    isImage: false,
                    prefix: `chat/${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`
                }),
            });

            if (res.status === 429) {
                toast.error("Too many uploads. Please wait a minute.");
                setIsUploading(false);
                return;
            }

            const { presignedUrl, key } = await res.json();

            const xhr = new XMLHttpRequest();
            xhr.open("PUT", presignedUrl, true);
            xhr.setRequestHeader("Content-Type", file.type || "application/pdf");

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(percent || 1);
                }
            };

            await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        setIsUploading(false);
                        setUploadProgress(0);
                        resolve(xhr.response);
                    } else {
                        reject(xhr.statusText);
                    }
                };
                xhr.onerror = () => reject(xhr.statusText);
                xhr.send(file);
            });

            setFileUrl(key);
            setFileName(file.name);

            // Reset input value to allow re-uploading same file
            if (e.target) e.target.value = "";
        } catch (error) {
            toast.error("Upload failed");
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setUploadProgress(0);
        try {
            const res = await fetch("/api/s3/upload", {
                method: "POST",
                body: JSON.stringify({
                    fileName: file.name,
                    contentType: file.type,
                    size: file.size,
                    isImage: true,
                    prefix: `chat/${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`
                }),
            });

            if (res.status === 429) {
                toast.error("Too many uploads. Please wait a minute.");
                setIsUploading(false);
                return;
            }

            const { presignedUrl, key } = await res.json();

            const xhr = new XMLHttpRequest();
            xhr.open("PUT", presignedUrl, true);
            xhr.setRequestHeader("Content-Type", file.type);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(percent);
                }
            };

            await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        setIsUploading(false);
                        setUploadProgress(0);
                        resolve(xhr.response);
                    } else {
                        reject(xhr.statusText);
                    }
                };
                xhr.onerror = () => reject(xhr.statusText);
                xhr.send(file);
            });

            setImageUrl(key);

            // Reset input value to allow re-uploading same file
            if (e.target) e.target.value = "";
        } catch (error) {
            toast.error("Upload failed");
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleRemoveAttachment = async (key: string, type: "image" | "file") => {
        try {
            // Optimistically clear UI
            if (type === "image") {
                setImageUrl("");
                const el = document.getElementById("chat-upload") as HTMLInputElement;
                if (el) el.value = "";
            } else {
                setFileUrl("");
                setFileName("");
                const el = document.getElementById("file-upload") as HTMLInputElement;
                if (el) el.value = "";
            }

            // Delete from S3
            await fetch("/api/s3/delete", {
                method: "DELETE",
                body: JSON.stringify({ key }),
                headers: { "Content-Type": "application/json" }
            });
        } catch (error) {
           
        }
    };

    const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsEditUploading(true);
        setUploadProgress(0);
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

            if (res.status === 429) {
                toast.error("Too many uploads. Please wait a minute.");
                setIsEditUploading(false);
                return;
            }

            const { presignedUrl, key } = await res.json();

            const xhr = new XMLHttpRequest();
            xhr.open("PUT", presignedUrl, true);
            xhr.setRequestHeader("Content-Type", file.type);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(percent);
                }
            };

            await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        setIsEditUploading(false);
                        setUploadProgress(0);
                        resolve(xhr.response);
                    } else {
                        reject(xhr.statusText);
                    }
                };
                xhr.onerror = () => reject(xhr.statusText);
                xhr.send(file);
            });

            setEditImageUrl(key);

            // Reset input value to allow re-uploading same file
            if (e.target) e.target.value = "";
        } catch (error) {
            toast.error("Upload failed");
        } finally {
            setIsEditUploading(false);
            setUploadProgress(0);
        }
    };

    const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsEditFileUploading(true);
        setUploadProgress(0);
        try {
            const res = await fetch("/api/s3/upload", {
                method: "POST",
                body: JSON.stringify({
                    fileName: file.name,
                    contentType: file.type || "application/pdf",
                    size: file.size,
                    isImage: false,
                
                    prefix: `chat/${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`
                }),
            });

            if (res.status === 429) {
                toast.error("Too many uploads. Please wait a minute.");
                setIsEditFileUploading(false);
                return;
            }

            const { presignedUrl, key } = await res.json();

            const xhr = new XMLHttpRequest();
            xhr.open("PUT", presignedUrl, true);
            xhr.setRequestHeader("Content-Type", file.type || "application/pdf");

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(percent || 1);
                }
            };

            await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        setIsEditFileUploading(false);
                        setUploadProgress(0);
                        resolve(xhr.response);
                    } else {
                        reject(xhr.statusText);
                    }
                };
                xhr.onerror = () => reject(xhr.statusText);
                xhr.send(file);
            });

            setEditFileUrl(key);
            setEditFileName(file.name);

            // Reset input value to allow re-uploading same file
            if (e.target) e.target.value = "";
        } catch (error) {
            toast.error("Upload failed");
        } finally {
            setIsEditFileUploading(false);
            setUploadProgress(0);
        }
    };

    const handleResolve = async (id: string, feedback?: string) => {
        let previewText = "Issue Resolved";
        let finalizedFeedback = feedback;

        // Determine if it was positive or negative from the status
        const isPositive = resolveStatus === "Helpful";
        const isNegative = resolveStatus === "More Help";

        if (isPositive) {
            previewText = "Positive Feedback";
            finalizedFeedback = feedback ? `Positive Feedback: ${feedback}` : "Positive Feedback";
        } else if (isNegative) {
            previewText = "Negative Feedback";
            finalizedFeedback = feedback ? `Negative Feedback: ${feedback}` : "Negative Feedback";
        } else if (feedback) {
            const f = feedback.toLowerCase().trim();
            if (f === "resolved") {
                previewText = "Issue Resolved";
                finalizedFeedback = "Issue Resolved";
            } else if (f === "denied") {
                previewText = "Issue Denied";
                finalizedFeedback = "Issue Denied";
            } else {
                previewText = `Feedback: ${feedback}`;
            }
        }
        
        // 1. OPTIMISTIC UPDATE LOCAL UI
        setResolvingMessageId(null);
        setResolveFeedbackText("");
        setResolveStatus(null);

        // 2. INSTANT SIDEBAR UPDATE
        window.dispatchEvent(new CustomEvent("chat-thread-update", {
            detail: {
                threadId,
                lastMessage: previewText,
                updatedAt: new Date().toISOString(),
                resolved: true
            }
        }));

        // 3. OPTIMISTIC UPDATE MESSAGES QUERY DATA
        queryClient.setQueryData(["messages", threadId, currentUserId], (old: any) => {
            if (!old || !old.pages) return old;
            return {
                ...old,
                pages: old.pages.map((page: any) => ({
                    ...page,
                    messages: page.messages?.map((n: any) =>
                        n.id === id ? { ...n, resolved: true, feedback: finalizedFeedback || n.feedback } : n
                    ) || page.messages
                }))
            };
        });

        // 4. BACKGROUND ACTION
        (async () => {
            try {
                if (finalizedFeedback) {
                    await submitFeedbackAction({ notificationId: id, feedback: finalizedFeedback });
                } else {
                    await resolveTicketAction(id);
                }
                
                chatCache.invalidate(`messages_${threadId}`, currentUserId);
                chatCache.invalidate(getSidebarLocalKey(isAdmin), isAdmin ? undefined : currentUserId);
                queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
                queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
            } catch (e) {
                toast.error("Failed to submit feedback");
                refetch(); // Revert to server state
            }
        })();
    };

    const handleEditOpen = (msg: any) => {
        setEditingMessageId(msg.id);
        setEditContent(msg.content);
        setEditImageUrl(msg.imageUrl || "");
        setEditFileUrl(msg.fileUrl || "");
        setEditFileName(msg.fileName || "");
        setIsEditOpen(true);
    };

    const submitEditDialog = async () => {
        if (!editingMessageId || (!editContent.trim() && !editImageUrl && !editFileUrl)) return;

        const newContent = editContent.trim();
        const newImageUrl = editImageUrl;
        const newFileUrl = editFileUrl;
        const newFileName = editFileName;
        const msgId = editingMessageId;

        // OPTIMISTIC UPDATE
        queryClient.setQueryData(["messages", threadId, currentUserId], (oldData: any) => {
            if (!oldData) return oldData;
            const newPages = oldData.pages.map((page: any) => ({
                ...page,
                messages: page.messages.map((m: any) =>
                    m.id === msgId
                        ? {
                            ...m,
                            content: newContent,
                            imageUrl: newImageUrl || null,
                            fileUrl: newFileUrl || null,
                            fileName: newFileName || null,
                            updatedAt: new Date().toISOString()
                        }
                        : m
                )
            }));
            return { ...oldData, pages: newPages };
        });

        // SYNC SIDEBAR if latest
        if (messages.length > 0 && messages[messages.length - 1].id === msgId) {
            window.dispatchEvent(new CustomEvent("chat-thread-update", {
                detail: {
                    threadId,
                    lastMessage: newContent || (newImageUrl ? "Image" : (newFileUrl ? "PDF" : "Message")),
                    updatedAt: new Date().toISOString()
                }
            }));
        }

        setIsEditOpen(false);
        setEditingMessageId(null);
        setEditImageUrl("");
        setEditFileUrl("");
        setEditFileName("");

        try {
            await editMessageAction(msgId, newContent, newImageUrl, newFileUrl, newFileName);
            
            chatCache.invalidate(`messages_${threadId}`, currentUserId);
            chatCache.invalidate(getSidebarLocalKey(isAdmin), isAdmin ? undefined : currentUserId);
            queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
            
            toast.success("Message updated");
        } catch (e) {
            toast.error("Failed to update");
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
        }
    };

    const handleDelete = async (id: string) => {
        // Optimistic delete
        queryClient.setQueryData(["messages", threadId, currentUserId], (old: any) => {
            if (!old || !old.pages) return old;
            return {
                ...old,
                pages: old.pages.map((page: any) => ({
                    ...page,
                    messages: page.messages?.filter((msg: any) => msg.id !== id) || []
                }))
            };
        });

        try {
            const res = await deleteMessageAction(id);
            if (res && !res.success) {
                 throw new Error(res.error || "Failed to delete");
            }

            chatCache.invalidate(`messages_${threadId}`, currentUserId);
            chatCache.invalidate(getSidebarLocalKey(isAdmin), isAdmin ? undefined : currentUserId);
            queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });


            // SYNC SIDEBAR: Find the next latest message to show as preview
            const remainingMessages = messages.filter(m => m.id !== id);
            const lastMsg = remainingMessages[remainingMessages.length - 1];
            
            let preview = "No messages yet";
            let updatedAt = new Date().toISOString();

            if (lastMsg) {
                preview = lastMsg.content || "";
                if (!preview.trim()) {
                    if (lastMsg.imageUrl) preview = "Image";
                    else if (lastMsg.fileUrl) preview = `PDF (${lastMsg.fileName || "Document"})`;
                }
                updatedAt = lastMsg.createdAt;
            }

            window.dispatchEvent(new CustomEvent("chat-thread-update", {
                detail: {
                    threadId,
                    lastMessage: preview,
                    updatedAt: updatedAt
                }
            }));

        } catch (e: any) {
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
            toast.error(e.message || "Failed to delete");
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

        // OPTIMISTIC UPDATE MESSAGES
        queryClient.setQueryData(["messages", threadId, currentUserId], (old: any) => {
            if (!old || !old.pages) return old;
            return {
                ...old,
                pages: old.pages.map((page: any) => ({
                    ...page,
                    messages: page.messages?.map((n: any) =>
                        n.id === id ? { ...n, resolved: true, feedback: status } : n
                    ) || page.messages
                }))
            };
        });

        // INSTANT SIDEBAR UPDATE
        window.dispatchEvent(new CustomEvent("chat-thread-update", {
            detail: {
                threadId,
                lastMessage: status === "Denied" ? "Issue Denied" : "Issue Resolved",
                updatedAt: new Date().toISOString(),
                resolved: true
            }
        }));

        try {
            chatCache.invalidate(`messages_${threadId}`, currentUserId);
            chatCache.invalidate(getSidebarLocalKey(isAdmin), isAdmin ? undefined : currentUserId);
            queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
        } catch (e) {
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
            toast.error("Failed to update ticket status");
        } finally {
            setIsBusy(false);
        }
    };


    const handleArchiveChat = async () => {
        if (isBusy) return;
        setIsBusy(true);

        const nextArchived = !isArchived;

        // 1. OPTIMISTIC UPDATE LOCAL STATE
        setIsArchived(nextArchived);

        // 2. OPTIMISTIC UPDATE SIDEBAR CACHE
        queryClient.setQueryData(SIDEBAR_KEY, (old: any) => {
            if (!old || !old.threads) return old;
            return {
                ...old,
                threads: old.threads.map((t: any) =>
                    t.threadId === threadId ? { ...t, archived: nextArchived } : t
                )
            };
        });

        // 3. OPTIMISTIC UPDATE MESSAGES STATE
        queryClient.setQueryData(["messages", threadId, currentUserId], (old: any) => {
            if (!old || !old.pages) return old;
            const newPages = [...old.pages];
            if (newPages[0]) {
                newPages[0] = {
                    ...newPages[0],
                    state: { ...newPages[0].state, isArchived: nextArchived }
                };
            }
            return { ...old, pages: newPages };
        });

        window.dispatchEvent(new CustomEvent("chat-thread-update", {
            detail: { threadId, archived: nextArchived }
        }));

        try {
            await archiveThreadAction(threadId);
            chatCache.invalidate(`messages_${threadId}`, currentUserId);
            chatCache.invalidate(getSidebarLocalKey(isAdmin), isAdmin ? undefined : currentUserId);
            queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
        } catch (e) {
            // REVERT ON FAILURE
            setIsArchived(!nextArchived);
            queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });

            toast.error("Failed to archive chat");
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
            chatCache.invalidate(`messages_${threadId}`, currentUserId);
            chatCache.invalidate(getSidebarLocalKey(isAdmin), isAdmin ? undefined : currentUserId);
            queryClient.invalidateQueries({ queryKey: SIDEBAR_KEY });
            queryClient.invalidateQueries({ queryKey: ["messages", threadId, currentUserId] });
            toast.success("Chat deleted successfully");
        } catch (e: any) {
            toast.error(e.message || "Failed to remove");
            // Trigger refresh to bring it back if optimistic failed
            window.dispatchEvent(new Event("chat-refresh"));
        } finally {
            setIsBusy(false);
        }
    };


    const handleShowGroupInfo = async () => {
        if (!isGroup) return;

        // 1. Load from LocalStorage instantly
        const cacheKey = `participants_${threadId}`;
        const cached = chatCache.get<any[]>(cacheKey, currentUserId);
        
        // Industry Standard: Only refresh if data is older than 30 mins (stale)
        // We store the timestamp in the cache entry itself
        const now = Date.now();
        const STALE_TIME = 30 * 60 * 1000; // 30 minutes
        
        let isStale = true;
        if (cached) {
            setGroupParticipants(cached.data);
            setShowGroupInfo(true);
            
            const lastSyncStr = localStorage.getItem(`chat_cache_${currentUserId}_participants_${threadId}_sync`);
            const lastSync = lastSyncStr ? parseInt(lastSyncStr) : 0;
            
            if (now - lastSync < STALE_TIME) {
                isStale = false;
                console.log(`[ChatWindow] Group participants are fresh. Skipping Redis request.`);
            }
        }

        if (isStale) {
            try {
                console.log(`[ChatWindow] Group participants stale or missing. Fetching from Redis...`);
                const participants = await getGroupParticipantsAction(threadId);
                setGroupParticipants(participants);
                
                // 3. Update LocalStorage with syncTime
                const cacheData = { data: participants, syncTime: now };
                // We pass undefined for version since we're using syncTime for participants
                chatCache.set(cacheKey, participants, currentUserId, undefined);
                
                // Small hack: chatCache doesn't natively store 'syncTime' in the 'data' part, 
                // but we can wrap our data or just rely on the fact that it's updated.
                // Let's actually just save it inside the metadata if we want to be clean, 
                // but custom 'set' with syncTime is easier.
                localStorage.setItem(`chat_cache_${currentUserId}_${cacheKey}_sync`, now.toString());

                if (!cached) setShowGroupInfo(true);
            } catch (e) {
                if (!cached) toast.error("Failed to load group info");
            }
        }
    };



    const displayAvatar = avatarUrl ? (avatarUrl.startsWith("http") || avatarUrl.startsWith("/") ? avatarUrl : useConstructUrl(avatarUrl)) : undefined;

    return (
        <div className="flex flex-col h-full min-h-0 bg-muted/20 overflow-hidden">
            {/* HEADER */}
            <div className="p-4 border-b bg-background flex items-center justify-between shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-3">
                    {!showGroupInfo && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Back to threads"
                            className="h-8 w-8 lg:hidden"
                            onClick={() => onBack?.()}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}

                    {showGroupInfo && (
                        <Button variant="ghost" size="icon" aria-label="Close group info" className="h-8 w-8" onClick={() => setShowGroupInfo(false)}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <Avatar>
                        <AvatarImage src={displayAvatar} className="object-cover" width={200} height={200} />
                        <AvatarFallback>{title.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h3 className="font-bold text-sm">
                            {showGroupInfo ? "Group Info" : title}
                        </h3>
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
                                aria-label="Thread options"
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
                                onClick={() => handleArchiveChat()}
                                className="cursor-pointer py-2 rounded-md focus:bg-primary/5"
                            >
                                <Archive className="h-4 w-4 mr-2" />
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
                                <AvatarImage src={displayAvatar} className="object-cover" width={200} height={200} />
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
                                                <AvatarImage src={p.user.image} className="object-cover" width={200} height={200} />
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
                            className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar p-3 md:p-4 md:pt-2 space-y-4 md:space-y-6"
                            ref={scrollRef}
                            onScroll={handleScroll}
                        >
                        {loading ? (
                            <div className="space-y-6 p-4">
                                {[1, 2, 3].map(i => (
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
                                const showAvatar = i === 0 || messages[i - 1].senderId !== msg.senderId;

                                return (
                                    <div key={msg.id} className={cn(
                                        "flex flex-col md:flex-row gap-1.5 md:gap-3 max-w-[85%] md:max-w-[80%] animate-in fade-in slide-in-from-bottom-2 duration-300 mt-2 md:mt-4", 
                                        isMe ? "ml-auto items-end md:items-start md:flex-row-reverse" : "items-start"
                                    )}>
                                        {showAvatar ? (
                                            <Avatar className="h-7 w-7 md:h-8 md:w-8 border shrink-0">
                                                <AvatarImage src={msg.sender?.image} className="object-cover" width={200} height={200} />
                                                <AvatarFallback>{msg.sender?.name?.[0] || "?"}</AvatarFallback>
                                            </Avatar>
                                        ) : <div className="hidden md:block md:w-8" />}

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
                                                    isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card border rounded-tl-none",
                                                )}>
                                                    {/* Chevron Trigger */}
                                                    {isMe && isAdmin && (
                                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" aria-label="Message options" className="h-5 w-5 rounded-full hover:bg-black/10 p-0">
                                                                        <ChevronDown className={cn("h-3 w-3", isMe ? "text-primary-foreground/70" : "text-muted-foreground")} />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    {isAdmin && (
                                                                        <DropdownMenuItem onClick={() => handleEditOpen(msg)}>
                                                                            <Pencil className="h-3 w-3 mr-2" /> Edit
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    {isAdmin && (
                                                                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(msg.id)}>
                                                                            <Trash2 className="h-3 w-3 mr-2" /> Delete
                                                                        </DropdownMenuItem>
                                                                    )}
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

                                                    {msg.fileUrl && (
                                                        <div className="mb-2 p-3 bg-muted/30 rounded-lg flex items-center gap-3 border group/file hover:bg-muted/50 transition-colors pr-4">
                                                            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                                                                <Paperclip className="h-5 w-5 text-red-600" />
                                                            </div>
                                                            <div className="min-w-0 flex-1 mr-2">
                                                                <p className="text-xs font-medium truncate">{msg.fileName || "Document"}</p>
                                                                <p className="text-[10px] text-muted-foreground">Attached File</p>
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 hover:bg-background rounded-full shrink-0"
                                                                onClick={() => triggerDirectDownload(useConstructUrl(msg.fileUrl), msg.fileName || "download", msg.id)}
                                                                disabled={downloadingFileId === msg.id}
                                                            >
                                                                {downloadingFileId === msg.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                                ) : (
                                                                    <Download className="h-4 w-4 text-muted-foreground group-hover/file:text-primary transition-colors" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    )}
                                                    <MessageContent content={msg.content} />

                                                    {isMe && (
                                                        <div className="absolute bottom-1 right-1.5 flex items-center">
                                                            {msg.status === "sending" ? (
                                                                <div className="h-2.5 w-2.5 rounded-full border-b border-r border-current animate-spin opacity-50" />
                                                            ) : msg.status === "error" ? (
                                                                <CircleX className="h-2.5 w-2.5 text-red-400" />
                                                            ) : (
                                                                <CircleCheckBig className="h-2.5 w-2.5 text-primary-foreground/70" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={cn("text-[10px] text-muted-foreground px-1 block", isMe && "text-right")}>
                                                {isToday(new Date(msg.createdAt))
                                                    ? format(new Date(msg.createdAt), "h:mm a")
                                                    : formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                                            </span>

                                            {/* FEEDBACK UI etc */}
                                            {!isAdmin && !isMe && msg.type === "ADMIN_REPLY" && !msg.resolved && !msg.feedback && (
                                                <div className="mt-2 bg-background border rounded-lg p-2.5 space-y-2 w-full shadow-sm animate-in fade-in zoom-in-95 duration-200">
                                                    {resolvingMessageId === msg.id ? (
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                    {resolveStatus === "Helpful" ? "Quick Feedback (Optional)" : "How can we improve?"}
                                                                </span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-5 w-5 rounded-full"
                                                                    onClick={() => {
                                                                        setResolvingMessageId(null);
                                                                        setResolveStatus(null);
                                                                    }}
                                                                >
                                                                    <X className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                            <div className="relative">
                                                                <Textarea
                                                                    value={resolveFeedbackText}
                                                                    onChange={(e) => setResolveFeedbackText(e.target.value)}
                                                                    placeholder={resolveStatus === "Helpful" ? "Tell us more..." : "What went wrong?"}
                                                                    className="min-h-[60px] text-xs resize-none pr-12"
                                                                    maxLength={300}
                                                                />
                                                                <span className={cn(
                                                                    "absolute bottom-2 right-2 text-[9px] font-medium",
                                                                    resolveFeedbackText.length >= 280 ? "text-orange-500" : "text-muted-foreground/50"
                                                                )}>
                                                                    {resolveFeedbackText.length}/300
                                                                </span>
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                className={cn(
                                                                    "w-full h-8 text-[11px] font-bold",
                                                                    resolveStatus === "Helpful" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"
                                                                )}
                                                                onClick={() => handleResolve(msg.id, resolveFeedbackText || resolveStatus!)}
                                                            >
                                                                {resolveStatus === "Helpful" ? "Submit & Resolve" : "Request More Help"}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <p className="text-[10px] font-bold text-center text-muted-foreground">WAS THIS HELPFUL?</p>
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="flex-1 h-8 text-[11px] font-bold hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-all"
                                                                    onClick={() => {
                                                                        setResolvingMessageId(msg.id);
                                                                        setResolveStatus("Helpful");
                                                                    }}
                                                                >
                                                                    <ThumbsUp className="h-3.5 w-3.5 mr-1.5" /> Yes
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="flex-1 h-8 text-[11px] font-bold hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 transition-all"
                                                                    onClick={() => {
                                                                        setResolvingMessageId(msg.id);
                                                                        setResolveStatus("More Help");
                                                                    }}
                                                                >
                                                                    No
                                                                </Button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            {/* RESOLVED/DENIED INDICATOR */}
                                            {(msg.resolved || msg.feedback) ? (
                                                <div className="flex justify-center w-full mt-2 animate-in zoom-in-95 duration-300">
                                                    <div className={cn(
                                                        "flex flex-col gap-1 px-3 py-1.5 rounded-xl border text-[11px] font-semibold shadow-sm",
                                                        (() => {
                                                            const f = msg.feedback?.toLowerCase().trim() || "";
                                                            return f.includes("negative feedback") || f === "denied" || f === "more help";
                                                        })()
                                                            ? "bg-red-50 text-red-700 border-red-100 shadow-red-100/20"
                                                            : "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-emerald-100/20"
                                                    )}>
                                                        <div className="flex items-center gap-2">
                                                            {(() => {
                                                                const f = msg.feedback?.toLowerCase().trim() || "";
                                                                const isNegative = f === "denied" || f.includes("negative feedback") || f === "more help";
                                                                return isNegative ? <CircleX className="h-3 w-3" /> : <CircleCheckBig className="h-3 w-3" />;
                                                            })()}
                                                            <span>
                                                                {(() => {
                                                                    const f = msg.feedback?.toLowerCase().trim() || "";
                                                                    if (f === "denied") return "Issue Denied";
                                                                    if (f === "resolved") return "Issue Resolved";
                                                                    if (f.includes("positive feedback") || ["helpful", "yes"].includes(f)) return "Positive Feedback";
                                                                    if (f.includes("negative feedback") || ["more help", "no"].includes(f)) return "Negative Feedback";
                                                                    return "Feedback Provided";
                                                                })()}
                                                            </span>
                                                        </div>

                                                        {msg.feedback && !["Resolved", "Positive Feedback", "Negative Feedback", "Helpful", "More Help", "Denied"].includes(msg.feedback) && (
                                                            <div className="mt-1 pt-1 border-t border-current/10 text-[10px] italic font-medium opacity-90 leading-relaxed max-w-[250px] wrap-break-word">
                                                                "{msg.feedback.replace(/^Positive Feedback: /, "").replace(/^Negative Feedback: /, "")}"
                                                            </div>
                                                        )}

                                                    </div>
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

                    {/* UPLOAD PROGRESS BAR */}
                    {isUploading && (
                        <div className="px-4 py-2 border-t bg-muted/30">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Uploading Progress</span>
                                <span className="text-[10px] font-bold text-primary">{uploadProgress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden border border-muted-foreground/10">
                                <div
                                    className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_8px_rgba(var(--primary),0.4)]"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* INPUT */}
                    {(isAdmin) ? (
                        <div className="p-4 bg-background border-t shrink-0">
                            {imageUrl && (
                                <div className="flex items-center gap-2 mb-2 p-2 bg-muted rounded-lg w-fit">
                                    <span className="text-xs text-muted-foreground">Image attached</span>
                                    <button onClick={() => handleRemoveAttachment(imageUrl, "image")}>
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                            {fileUrl && (
                                <div className="flex items-center gap-2 mb-2 p-2 bg-muted rounded-lg w-fit">
                                    <Paperclip className="h-4 w-4 text-primary" />
                                    <span className="text-xs font-medium truncate max-w-[150px]">{fileName}</span>
                                    <button onClick={() => handleRemoveAttachment(fileUrl, "file")}>
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                            <div className="flex items-end gap-2 bg-muted/30 p-2 rounded-xl border focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Upload Image"
                                    className="h-10 w-10 shrink-0 rounded-full hover:bg-muted"
                                    onClick={() => document.getElementById("chat-upload")?.click()}
                                    disabled={isUploading}
                                    title="Upload Image"
                                >
                                    {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                                </Button>
                                <input
                                    id="chat-upload"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />

                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Upload Document"
                                    className="h-10 w-10 shrink-0 rounded-full hover:bg-muted"
                                    onClick={() => document.getElementById("file-upload")?.click()}
                                    disabled={isUploading}
                                    title="Upload Document"
                                >
                                    {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5 text-muted-foreground" />}
                                </Button>
                                <input
                                    id="file-upload"
                                    type="file"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                                    className="hidden"
                                    onChange={handleFileUpload}
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
                                    aria-label="Send message"
                                    className="h-10 w-10 shrink-0 rounded-full"
                                    disabled={(!inputText.trim() && !imageUrl && !fileUrl) || isUploading}
                                    onClick={handleSendMessage}
                                >
                                    <Send className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-muted/5 border-t text-center shrink-0">
                            <p className="text-xs text-muted-foreground italic">
                                {isAdmin ? "You are not a member of this group." : "Only admins can send messages in this group."}
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

                    {/* Edit File Area */}
                    {editFileUrl && (
                        <div className="relative mb-3 w-full p-3 bg-muted/30 rounded-lg flex items-center gap-3 border shadow-sm group">
                            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                                <Paperclip className="h-5 w-5 text-red-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">{editFileName || "Document"}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Current Attachment</p>
                            </div>
                            <button
                                onClick={() => {
                                    setEditFileUrl("");
                                    setEditFileName("");
                                }}
                                className="h-6 w-6 bg-destructive/10 text-destructive rounded-full flex items-center justify-center hover:bg-destructive hover:text-white transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Upload Progress for Edit */}
                    {(isEditUploading || isEditFileUploading) && (
                        <div className="mb-3">
                             <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase">Uploading...</span>
                                <span className="text-[9px] font-bold text-primary">{uploadProgress}%</span>
                            </div>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="min-h-[100px] border-muted-foreground/20 focus-visible:ring-primary/20"
                            placeholder="Message content..."
                        />
                        <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-full"
                                    onClick={() => document.getElementById("edit-image-upload")?.click()}
                                    disabled={isEditUploading || isEditFileUploading}
                                    title="Change Image"
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

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-full"
                                    onClick={() => document.getElementById("edit-file-upload")?.click()}
                                    disabled={isEditUploading || isEditFileUploading}
                                    title="Change Document"
                                >
                                    {isEditFileUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-5 w-5 text-muted-foreground" />}
                                </Button>
                                <input
                                    id="edit-file-upload"
                                    type="file"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                                    className="hidden"
                                    onChange={handleEditFileUpload}
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                                <Button size="sm" onClick={submitEditDialog} disabled={isEditUploading || isEditFileUploading}>Save Changes</Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );

    async function triggerDirectDownload(url: string, fileName: string, id: string) {
        if (downloadingFileId) return;
        setDownloadingFileId(id);
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
         
            window.open(url, "_blank");
        } finally {
            setDownloadingFileId(null);
        }
    }
}
