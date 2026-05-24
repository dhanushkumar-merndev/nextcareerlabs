"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Bot, X, Send, ChevronDown, Maximize2, Minimize2, Menu, Plus, Trash2, Loader2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { getSessions, createSession, getMessages, saveMessages, updateSessionTimestamp, updateSessionTitle, deleteSession } from "@/lib/chat-db";
import type { ChatSession, ChatMessage as DBChatMessage } from "@/lib/chat-db";

const timestampRegex = /(?:\[)?(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\s*-->\s*(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)(?:\])?|\[(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\]/g;

const toSeconds = (t: string) => {
  const parts = t.split(":").map(Number);
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
};

const fmtTime = (t: string) => t.replace(/\.\d+$/, "");

const trimTimestamp = (t: string) => t.replace(/[.,!?:;\s]+$/g, "").trim();

function TimestampBadge({ start, end, videoDuration, restrictionTime }: { start: string; end: string; videoDuration?: number; restrictionTime?: number }) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const secs = Math.max(0, toSeconds(start) - 3);
    if (videoDuration !== undefined && secs > videoDuration) {
      toast.error("Watch the full video to use this feature");
      return;
    }
    if (restrictionTime !== undefined && secs > restrictionTime) {
      toast.error("Watch more of the video to use this feature");
      return;
    }
    window.dispatchEvent(new CustomEvent("video-seek", { detail: { time: secs } }));
  };
  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-mono hover:bg-primary/20 transition-all cursor-pointer mx-0.5 align-middle whitespace-nowrap no-underline shadow-sm active:scale-95"
      title="Click to seek video to this timestamp"
    >
      {start === end ? fmtTime(start) : `${fmtTime(start)} – ${fmtTime(end)}`}
    </button>
  );
}

function MarkdownWithTimestamps({ content, videoDuration, restrictionTime }: { content: string; videoDuration?: number; restrictionTime?: number }) {
  const segments = useMemo(() => {
    const all: { type: "text" | "badge"; text?: string; start?: string; end?: string }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = timestampRegex.exec(content)) !== null) {
      if (m.index > last) {
        let text = content.slice(last, m.index);
        // Strip trailing punctuation/whitespace from text before a badge (sentence punctuation around timestamp)
        text = text.replace(/[\s\n\r]*[.,!?:;]+[\s\n\r]*$/, "");
        if (text) all.push({ type: "text", text });
      }
      if (m[1] !== undefined) {
        all.push({ type: "badge", start: trimTimestamp(m[1]), end: trimTimestamp(m[2]) });
      } else if (m[3] !== undefined) {
        const t = trimTimestamp(m[3]);
        all.push({ type: "badge", start: t, end: t });
      }
      last = m.index + m[0].length;
    }
    if (last < content.length) {
      let text = content.slice(last);
      // Strip leading punctuation/whitespace after last badge (sentence punctuation around timestamp)
      text = text.replace(/^[\s\n\r]*[.,!?:;:]+[\s\n\r]*/, "");
      if (text) all.push({ type: "text", text });
    }
    return all;
  }, [content]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "badge" ? (
          <TimestampBadge key={i} start={seg.start!} end={seg.end!} videoDuration={videoDuration} restrictionTime={restrictionTime} />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>
            {seg.text!}
          </ReactMarkdown>
        ),
      )}
    </>
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface FloatingChatProps {
  lessonId: string;
  userId: string;
  vttText?: string;
  remaining?: string;
  isOpen: boolean;
  onClose: () => void;
  videoDuration?: number;
  restrictionTime?: number;
}

export function FloatingChat({ lessonId, userId, vttText, remaining, isOpen, onClose, videoDuration, restrictionTime }: FloatingChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0, baseX: 0, baseY: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [size, setSize] = useState({ width: 384, height: 480 });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [windowWidth, setWindowWidth] = useState(1024);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [showResizeOverlay, setShowResizeOverlay] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSessionList, setShowSessionList] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const isResizing = useRef(false);

  // Load sessions
  useEffect(() => {
    if (!lessonId || !userId) return;
    getSessions(lessonId, userId).then((existing) => {
      setSessions(existing);
      if (existing.length > 0) {
        setCurrentSessionId(existing[0].id);
      }
    }).finally(() => setIsDbReady(true));
  }, [lessonId, userId]);

  // Load messages when session changes
  const isNewSessionRef = useRef(false);
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      lastSavedCount.current = 0;
      return;
    }
    // Don't reload messages from DB for a brand new session (created on first send)
    if (isNewSessionRef.current) {
      isNewSessionRef.current = false;
      return;
    }
    getMessages(currentSessionId).then((msgs) => {
      msgs.sort((a, b) => a.createdAt - b.createdAt);
      setMessages(msgs.map((m) => ({ role: m.role, content: m.content })));
      // Reset save tracking for new session so all loaded messages are considered "saved"
      lastSavedCount.current = msgs.length;
    });
  }, [currentSessionId]);

  const switchSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setShowSessionList(false);
    hasNamed.current = false;
  }, []);

  const handleNewSession = useCallback(async () => {
    const s = await createSession(lessonId, userId);
    setSessions((prev) => [s, ...prev]);
    setCurrentSessionId(s.id);
    setShowSessionList(false);
    hasNamed.current = false;
  }, [lessonId, userId]);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await deleteSession(sessionId);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      if (currentSessionId === sessionId) {
        if (next.length > 0) {
          setCurrentSessionId(next[0].id);
        } else {
          setCurrentSessionId(null);
        }
      }
      return next;
    });
  }, [currentSessionId]);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      setWindowWidth(window.innerWidth);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsAnimatingOut(false);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      onClose();
      setIsAnimatingOut(false);
    }, 300);
  }, [onClose]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const header = (e.target as HTMLElement).closest(".chat-header");
    if (!header) return;
    if (!chatRef.current) return;
    const rect = chatRef.current.getBoundingClientRect();
    chatRef.current.style.willChange = "transform";
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      baseX: rect.left,
      baseY: rect.top,
    };
    setIsDragging(true);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const header = (e.target as HTMLElement).closest(".chat-header");
    if (!header) return;
    if (!chatRef.current) return;
    const touch = e.touches[0];
    const rect = chatRef.current.getBoundingClientRect();
    chatRef.current.style.willChange = "transform";
    dragRef.current = {
      isDragging: true,
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
      baseX: rect.left,
      baseY: rect.top,
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    document.body.style.userSelect = "none";
    let rafId: number | null = null;
    let lastDx = 0;
    let lastDy = 0;
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        lastDx = clientX - dragRef.current.startX;
        lastDy = clientY - dragRef.current.startY;
        const el = chatRef.current;
        if (el) {
          el.style.transform = `translate(${lastDx}px, ${lastDy}px)`;
        }
      });
    };
    const onUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      const el = chatRef.current;
      const d = dragRef.current;
      if (el) {
        const finalX = Math.max(0, d.baseX + lastDx);
        const finalY = Math.max(0, d.baseY + lastDy);
        el.style.transform = "";
        el.style.willChange = "";
        el.style.left = `${finalX}px`;
        el.style.top = `${finalY}px`;
        setPosition({ x: finalX, y: finalY });
      } else {
        setPosition({ x: d.baseX, y: d.baseY });
      }
      setIsDragging(false);
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  const onResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    setShowResizeOverlay(true);
    const startX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const startY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const startW = size.width;
    const startH = size.height;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "se-resize";

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!isResizing.current) return;
      const cx = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
      const cy = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
      setSize({
        width: Math.max(320, startW + cx - startX),
        height: Math.max(420, startH + cy - startY),
      });
    };
    const onUp = () => {
      isResizing.current = false;
      setShowResizeOverlay(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
  }, [size]);

  // Scroll to bottom on new messages, show arrow when user scrolls up
  useEffect(() => {
    if (!isLoading && !streamingText && messages.length > 0) {
      const el = messagesEndRef.current?.parentElement;
      if (el) {
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (isNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          setShowScrollBtn(false);
        }
      }
    }
  }, [messages, isLoading, streamingText]);

  // Auto-scroll during streaming so new text is always visible
  useEffect(() => {
    if (streamingText) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [streamingText]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setShowScrollBtn(target.scrollHeight - target.scrollTop - target.clientHeight > 100);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    // Create session on first message
    let sessionId = currentSessionId;
    if (!sessionId) {
      const s = await createSession(lessonId, userId);
      isNewSessionRef.current = true;
      setSessions((prev) => [s, ...prev]);
      setCurrentSessionId(s.id);
      hasNamed.current = false;
      sessionId = s.id;
    }

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setStreamingText("");

    try {
      const allMessages = [...messages, userMsg];
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          lessonId,
          vttText: vttText || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => [...prev, { role: "assistant", content: err.error || "Something went wrong" }]);
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setIsLoading(false);
        return;
      }

      let fullText = "";
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setStreamingText(fullText);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: fullText }]);
      setStreamingText("");
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to connect. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, currentSessionId, lessonId, userId, messages, vttText]);

  // Save messages to IndexedDB when they change
  const lastSavedCount = useRef(0);
  const msgSeqRef = useRef(0);
  useEffect(() => {
    if (!currentSessionId || !isDbReady || messages.length <= lastSavedCount.current) return;
    const newMsgs = messages.slice(lastSavedCount.current);
    lastSavedCount.current = messages.length;
    const now = Date.now();
    const dbMsgs: DBChatMessage[] = newMsgs.map((m, i) => ({
      id: `${now}-${msgSeqRef.current++}`,
      sessionId: currentSessionId,
      role: m.role,
      content: m.content,
      createdAt: now + i,
    }));
    saveMessages(dbMsgs).then(() => updateSessionTimestamp(currentSessionId));
  }, [messages, currentSessionId, isDbReady]);

  // Auto-name session from first AI response
  const hasNamed = useRef(false);
  useEffect(() => {
    if (!currentSessionId || !isDbReady || hasNamed.current) return;
    const aiMsg = messages.find((m) => m.role === "assistant");
    if (aiMsg) {
      const title = aiMsg.content.replace(/[*#\[\]\(\)]/g, "").trim().slice(0, 50) || new Date().toLocaleString();
      updateSessionTitle(currentSessionId, title);
      setSessions((prev) => prev.map((s) => s.id === currentSessionId ? { ...s, title } : s));
      hasNamed.current = true;
    }
  }, [messages, currentSessionId, isDbReady]);

  const remainingText = remaining !== undefined ? `${remaining} msg left` : null;

  if (!isOpen && !isAnimatingOut) return null;

  const chatContent = (
    <>
      <div className="chat-header flex items-center justify-between px-4 py-3.5 bg-gradient-to-br from-primary via-primary/95 to-primary/90 shrink-0 cursor-grab active:cursor-grabbing select-none shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-white/20 flex items-center justify-center shadow-inner shadow-black/10">
            <Bot className="size-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white drop-shadow-sm">Course Assistant</p>
            {remainingText && (
              <p className="text-[10px] text-white/70 leading-tight">{remainingText}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleNewSession(); }}
            className="size-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-all active:scale-95"
            title="New session"
          >
            <Plus className="size-3.5 text-white" />
          </button>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowSessionList((v) => !v); }}
              className="size-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-all active:scale-95"
              title="Switch session"
            >
              <Menu className="size-3.5 text-white" />
            </button>
            {showSessionList && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSessionList(false)} />
                <div className={cn(
                  "absolute z-50 bg-card border border-border/50 rounded-xl shadow-2xl shadow-black/20 py-1.5 min-w-[200px] overflow-hidden",
                  isMobile ? "left-0" : "right-0",
                  isMobile ? "bottom-full mb-2" : "top-full mt-1",
                )}>
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
                    <span className="text-xs font-semibold text-muted-foreground">Sessions</span>
                    <div className="flex items-center gap-1">
                      {sessions.length > 0 && (
                      <button
                        onClick={async (e) => { e.stopPropagation(); await Promise.all(sessions.map((s) => deleteSession(s.id))); handleNewSession(); setShowSessionList(false); }}
                        className="size-5 rounded-md bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-all active:scale-90"
                        title="Delete all sessions"
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[176px] overflow-y-auto">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        onClick={(e) => { e.stopPropagation(); switchSession(s.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); switchSession(s.id); } }}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors hover:bg-accent cursor-pointer",
                          s.id === currentSessionId && "bg-primary/10 text-primary font-medium",
                        )}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{s.title.length > 20 ? s.title.slice(0, 20) + "…" : s.title}</span>
                          <span className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "/")}{" "}
                            {new Date(s.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                          </span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteSession(e, s.id)}
                          className="size-4 rounded hover:bg-muted flex items-center justify-center shrink-0 opacity-40 hover:opacity-100 transition-all"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          {!isMobile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isExpanded) {
                  setSize({ width: 384, height: 480 });
                } else {
                  setSize({
                    width: Math.min(560, windowWidth - 40),
                    height: Math.min(700, window.innerHeight - 100),
                  });
                }
                setIsExpanded(!isExpanded);
              }}
              className="size-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-all active:scale-95"
            >
              {isExpanded ? <Minimize2 className="size-3.5 text-white" /> : <Maximize2 className="size-3.5 text-white" />}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="size-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-all active:scale-95"
          >
            <X className="size-3.5 text-white" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 cursor-default overscroll-contain scroll-smooth bg-muted/30"
        data-lenis-prevent
        onScroll={handleScroll}
        style={{ minHeight: 0 }}
      >
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mb-4 shadow-inner">
              <Bot className="size-7 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Ask anything about this lesson</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed transition-shadow relative group",
                msg.role === "user"
                  ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-br-sm shadow-md shadow-primary/25"
                  : "bg-muted/60 text-card-foreground rounded-bl-sm border border-border/60 shadow-sm prose prose-sm dark:prose-invert max-w-none prose-strong:text-foreground prose-strong:font-bold",
              )}
            >
              {msg.role === "user" ? msg.content : <MarkdownWithTimestamps content={msg.content} videoDuration={videoDuration} restrictionTime={restrictionTime} />}
              {msg.role === "assistant" && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(msg.content);
                    setCopiedIdx(i);
                    setTimeout(() => setCopiedIdx(null), 2000);
                  }}
                  className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-all size-5 rounded bg-muted/80 hover:bg-muted flex items-center justify-center"
                  title="Copy response"
                >
                  {copiedIdx === i ? <Check className="size-3" /> : <Copy className="size-3" />}
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed bg-card text-card-foreground border border-border/50 shadow-sm prose prose-sm dark:prose-invert max-w-none prose-strong:text-foreground prose-strong:font-bold">
              <MarkdownWithTimestamps content={streamingText} videoDuration={videoDuration} restrictionTime={restrictionTime} />
              <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse rounded-sm" />
            </div>
          </div>
        )}
        {isLoading && !streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm bg-muted/60 text-card-foreground border border-border/60 shadow-sm">
              <div className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollBtn && (
        <button
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
          className={cn(
            "size-7 rounded-full bg-card hover:bg-accent flex items-center justify-center shadow-md border border-border/50 transition-all active:scale-90",
            isMobile ? "absolute right-4 bottom-16" : "absolute right-4 bottom-0",
          )}
        >
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      )}

      <div className="p-3 border-t border-border/60 bg-card/50 backdrop-blur-sm shrink-0 cursor-default overflow-hidden">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          className="flex items-center gap-2 min-w-0"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 min-w-0 bg-muted/70 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/30 border border-border/60 disabled:opacity-50 transition-shadow shadow-sm"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="size-9 rounded-xl bg-gradient-to-br from-primary to-primary/90 text-primary-foreground flex items-center justify-center shrink-0 hover:opacity-90 disabled:opacity-40 transition-all active:scale-95 shadow-md shadow-primary/25"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>

      {!isMobile && (
        <div
          onMouseDown={onResizeStart}
          onTouchStart={onResizeStart}
          className="absolute bottom-0 right-0 size-5 cursor-se-resize z-10 flex items-end justify-end"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="text-muted-foreground/50 mr-0.5 mb-0.5"
          >
            <polygon points="10,0 10,10 0,10" fill="currentColor" stroke="none" />
          </svg>
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        {showResizeOverlay && <div className="fixed inset-0 z-[99999]" />}
        <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[9999] flex flex-col bg-card text-card-foreground shadow-2xl shadow-black/20 rounded-t-2xl overflow-hidden",
          "transition-transform duration-300 ease-out",
          isAnimatingOut ? "translate-y-full" : "translate-y-0",
        )}
        style={{ maxHeight: "90vh" }}
      >
        {chatContent}
      </div>
      </>
    );
  }

  return (
    <>
      {showResizeOverlay && <div className="fixed inset-0 z-[99999]" />}
      <div
      ref={chatRef}
      className={cn(
        "fixed z-[9999] w-80 sm:w-96 flex flex-col rounded-2xl overflow-hidden",
        "bg-card text-card-foreground shadow-2xl shadow-black/20 ring-1 ring-black/5",
      )}
      style={{
        left: position.x || Math.max(16, windowWidth - 420),
        top: position.y || 80,
        width: size.width,
        height: size.height,
        willChange: isDragging ? "transform" : undefined,
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      {chatContent}
    </div>
    </>
  );
}
