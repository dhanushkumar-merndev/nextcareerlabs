"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreVertical, 
  CheckCircle, 
  XCircle, 
  ShieldAlert, 
  ShieldCheck,
  Copy,
  Mail,
  User as UserIcon,
  BookOpen,
  Calendar as CalendarIcon,
  Phone,
  Edit,
  Loader2,
  Filter,
  Fingerprint,
  Trash2,
  Search,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { 
  updateEnrollmentStatusAction, 
  banUserAction, 
  unbanUserAction, 
  getRequestsAction,
  updateUserDetailsAction,
  deleteEnrollmentAction
} from "../actions";
import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRefreshRateLimit } from "@/hooks/use-refresh-rate-limit";
import { cn } from "@/lib/utils";
import { secureStorage } from "@/lib/secure-storage";
import { chatCache } from "@/lib/chat-cache";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatIST } from "@/lib/utils";
import { EnrollmentStatus } from "@/generated/prisma";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Request {
  id: string;
  status: string;
  createdAt: Date;
  Course: {
    title: string;
    id: string;
  };
  User: {
    id: string;
    name: string;
    email: string;
    phoneNumber: string | null;
    image: string | null;
    createdAt: Date;
    banned: boolean | null;
  };
}

const BATCH_SIZE = 10;

export function RequestsTable({ initialData, totalCount: initialTotalCount, version: initialVersion }: { initialData: Request[], totalCount: number, version?: string }) {
  const [data, setData] = useState<Request[]>(initialData);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [version, setVersion] = useState<string | null>(initialVersion || null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialData.length < initialTotalCount);
  const [confirmConfig, setConfirmConfig] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    actionText: string;
    isDestructive?: boolean;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
    actionText: "",
  });

  // Edit State
  const [editingUser, setEditingUser] = useState<Request["User"] | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const isInitialized = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasLogged = useRef(false);
  const { checkRateLimit } = useRefreshRateLimit(5, 60000);


  const clearLocalCache = useCallback((userId?: string) => {
    secureStorage.removeItemTracked("admin_enrollment_requests");
    secureStorage.removeItemTracked("admin_enrollment_version");
    secureStorage.removeItemTracked("admin_enrollment_last_sync");

    // If we have a userId (Admin = User testing), clear their specific pages too
    if (userId) {
      secureStorage.removeItemTracked(`chat_cache_${userId}_user_enrolled_courses_${userId}`);
      secureStorage.removeItemTracked(`chat_cache_${userId}_available_courses_${userId}`);
      secureStorage.removeItemTracked(`chat_cache_${userId}_user_dashboard_${userId}`);
    }

    // 4. Invalidate all Admin Caches (Dashboard, Analytics, Resource Page)
    chatCache.invalidateAdminData();

    console.log(`[RequestsTable] Local cache cleared ${userId ? 'including user pages ' : ''}after admin action.`);
  }, []);

  const handleStatusUpdate = (id: string, request: Request, status: "Granted" | "Revoked" | "Pending") => {
    startTransition(async () => {
      const result = await updateEnrollmentStatusAction(id, status);
      if (result.status === "success") {
        toast.success(result.message);
        clearLocalCache(request.User.id);
        setData(prev => prev.map(item => item.id === id ? { ...item, status } : item));
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleBanToggle = (userId: string, isBanned: boolean) => {
    setConfirmConfig({
      open: true,
      title: isBanned ? "Unban User?" : "Ban User?",
      description: isBanned 
        ? "This will restore the user's access to the platform." 
        : "This will immediately revoke the user's access to all courses and features.",
      actionText: isBanned ? "Unban User" : "Ban User",
      isDestructive: !isBanned,
      onConfirm: () => {
        startTransition(async () => {
          const result = isBanned 
            ? await unbanUserAction(userId) 
            : await banUserAction(userId);
          if (result.status === "success") {
            toast.success(result.message);
            clearLocalCache(userId);
            setData(prev => prev.map(item => item.User.id === userId ? { ...item, User: { ...item.User, banned: !isBanned } } : item));
          } else {
            toast.error(result.message);
          }
          setConfirmConfig(prev => ({ ...prev, open: false }));
        });
      }
    });
  };

  const handleEditSave = async () => {
    if (!editingUser) return;
    
    startTransition(async () => {
      const result = await updateUserDetailsAction(editingUser.id, {
        email: editEmail,
        phoneNumber: editPhone,
      });
      
      if (result.status === "success") {
        toast.success(result.message);
        clearLocalCache(editingUser.id);
        setData(prev => prev.map(item => 
          item.User.id === editingUser.id 
            ? { ...item, User: { ...item.User, email: editEmail, phoneNumber: editPhone } } 
            : item
        ));
        setEditingUser(null);
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      open: true,
      title: "Delete Request?",
      description: "This action cannot be undone. This will permanently delete the enrollment request from the database.",
      actionText: "Delete Request",
      isDestructive: true,
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteEnrollmentAction(id);
          if (result.status === "success") {
            toast.success(result.message);
            clearLocalCache(); // Don't know userId here easily from list, but admin cache is cleared
            setData(prev => prev.filter(item => item.id !== id));
          } else {
            toast.error(result.message);
          }
          setConfirmConfig(prev => ({ ...prev, open: false }));
        });
      }
    });
  };

  // Debounce search effect
  useEffect(() => {
    // Skip if search matches current debounced value (prevents request storms)
    if (search === debouncedSearch) return;

    // Constraint: Only trigger if cleared (length 0) or meaningful (length >= 3)
    if (search.length > 0 && search.length < 3) return;

    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 1000);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  const [hasHydrated, setHasHydrated] = useState(false);

  const syncWithServer = useCallback(async (currentV: string | null) => {
    startTransition(async () => {
         const result = await getRequestsAction(0, BATCH_SIZE, "All", undefined, currentV || undefined);
         
         if (result.status === "not-modified") {
             console.log(`[RequestsTable] Smart Sync: Server version matches (${currentV}). Cache is fresh.`);
         } else {
             console.log(`[RequestsTable] Smart Sync: Server version mismatch or Cache Miss. Syncing ${result.data.length} items.`);
             setData(result.data as Request[]);
             setTotalCount(result.totalCount);
             setVersion(result.version);
             
             // Persist to secureStorage
             secureStorage.setItemTracked("admin_enrollment_requests", JSON.stringify({ data: result.data, totalCount: result.totalCount }));
             secureStorage.setItemTracked("admin_enrollment_version", result.version);
         }
         secureStorage.setItemTracked("admin_enrollment_last_sync", Date.now().toString());
         setHasHydrated(true);
    });
  }, [BATCH_SIZE]);

  const manualRefresh = async () => {
    if (!checkRateLimit()) return;
    setRefreshing(true);

    await syncWithServer(null);
    setRefreshing(false);
  };

  // --- SMART SYNC: MOUNT & PERSISTENCE ---
  useEffect(() => {
    const STORAGE_KEY = "admin_enrollment_requests";
    const VERSION_KEY = "admin_enrollment_version";
    const SYNC_TIMESTAMP_KEY = "admin_enrollment_last_sync";
    const SYNC_WINDOW = 30 * 60 * 1000; // 30 Minutes


    // 1. Initial Load from LocalStorage (if not searching)
    if (debouncedSearch === "") {
        const cached = secureStorage.getItem(STORAGE_KEY);
        const cachedVersion = secureStorage.getItem(VERSION_KEY);
        const lastSync = secureStorage.getItem(SYNC_TIMESTAMP_KEY);

        if (cached && cachedVersion) {
            if (!hasLogged.current) {
                console.log(`%c[RequestsTable] LOCAL HIT (${cachedVersion}). Rendering from device storage.`, "color: #eab308; font-weight: bold");
                hasLogged.current = true;
            }
            
            if (!hasHydrated) {
                const parsed = JSON.parse(cached);
                setData(parsed.data);
                setTotalCount(parsed.totalCount);
                setVersion(cachedVersion);
                setHasHydrated(true);
            }

            // 2. Determine if background revalidation is needed
            const now = Date.now();
            if (!lastSync || (now - parseInt(lastSync)) > SYNC_WINDOW) {
                if (!isInitialized.current) {
                    console.log(`[RequestsTable] Revalidation Window Open (>30m). Syncing...`);
                    isInitialized.current = true;
                    syncWithServer(cachedVersion);
                }
            }
        } else {
            if (!hasHydrated && !isInitialized.current) {
                 console.log(`[RequestsTable] No Local Cache. Triggering Initial Sync...`);
                 isInitialized.current = true;
                 syncWithServer(null);
            }
        }
    }

    // 3. Cross-Tab Sync: Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
        if (debouncedSearch !== "") return; // Don't sync while searching
        
        if (e.key === STORAGE_KEY && e.newValue) {
            const parsed = JSON.parse(e.newValue);
            setData(parsed.data);
            setTotalCount(parsed.totalCount);
            console.log(`[RequestsTable] Cross-Tab Sync: Data updated from another tab.`);
        }
        if (e.key === VERSION_KEY && e.newValue) {
            setVersion(e.newValue);
        }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);

  }, [debouncedSearch, hasHydrated]);

  // Handle search logic
  useEffect(() => {
    if (debouncedSearch === "") return; // Handled by Smart Sync effect

    startTransition(async () => {
      const result = await getRequestsAction(0, BATCH_SIZE, "All", debouncedSearch);
      setData(result.data as Request[]);
      setTotalCount(result.totalCount);
      setHasMore(result.data.length < result.totalCount);
      console.log(`[RequestsTable] Search synced with server for "${debouncedSearch}".`);
    });
  }, [debouncedSearch]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    
    const result = await getRequestsAction(data.length, BATCH_SIZE, "All", debouncedSearch);
    const newData = result.data as Request[];
    
    setData(prev => [...prev, ...newData]);
    setHasMore(data.length + newData.length < result.totalCount);
    setLoadingMore(false);
  }, [data.length, hasMore, loadingMore, debouncedSearch]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        {/* Search Bar - Responsive */}
        <div className="relative w-full sm:max-w-md group">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
           <Input 
             placeholder="Search by name, ID or email..." 
             className="pl-10 pr-10 h-11 bg-muted/30 border-2 border-border/40 rounded-xl focus:border-primary/50 transition-all font-medium py-2"
             value={search}
             onChange={(e) => setSearch(e.target.value)}
           />
           <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
             {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground/60" />}
             {search && !isPending && (
               <button 
                onClick={() => setSearch("")}
                className="hover:bg-muted/60 p-1 rounded-full text-muted-foreground/60 hover:text-foreground transition-colors"
               >
                 <XCircle className="size-4" />
               </button>
             )}
           </div>
        </div>

         {/* Info Badge & Refresh - Responsive */}
         <div className="flex items-center gap-2 w-full sm:w-auto">
             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 px-5 h-11 flex-1 sm:flex-initial rounded-xl border border-border/40 shadow-sm shrink-0 justify-center">
                  <Filter className="size-3 text-primary/60" />
                  <span>Showing {data.length} of {totalCount} Records</span>
             </div>
             <Button
               variant="outline"
               size="icon"
               className="h-11 w-11 rounded-xl border-border/40 bg-card/40 backdrop-blur-sm hover:bg-muted/50 transition-all shadow-sm"
               onClick={manualRefresh}
               disabled={refreshing || isPending}
               title="Sync with Server"
             >
                <RefreshCw className={cn("size-4", (refreshing || isPending) && "animate-spin text-primary")} />
             </Button>
         </div>
      </div>

      {/* --- DESKTOP VIEW --- */}
      <div className="hidden lg:block rounded-2xl border bg-card/40 backdrop-blur-md overflow-hidden border-border/40 shadow-xl">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead className="pl-6 font-black uppercase tracking-widest text-[10px] h-12">User Profile</TableHead>
              <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">Email</TableHead>
              <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">Phone</TableHead>
              <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">Course</TableHead>
              <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">Status</TableHead>
              <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">Joined</TableHead>
              <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">Requested</TableHead>
              <TableHead className="text-right pr-6 font-black uppercase tracking-widest text-[10px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground/60 italic">
                  <div className="flex flex-col items-center gap-2">
                    <BookOpen className="size-10 opacity-20" />
                    <p className="text-sm font-medium">No enrollment requests found matching filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((request) => (
                <TableRow key={request.id} className="hover:bg-muted/10 transition-colors border-border/20 group">
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="size-10 border-2 border-primary/20 shadow-sm">
                        <AvatarImage src={request.User.image || ""} />
                        <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-black uppercase">
                          {request.User.name.substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground text-sm uppercase tracking-tight">
                            {request.User.name}
                          </span>
                          {request.User.banned && (
                            <Badge variant="destructive" className="h-4 px-1 text-[8px] uppercase tracking-tighter font-black">Banned</Badge>
                          )}
                        </div>
                        <button 
                          onClick={() => copyToClipboard(request.User.id, "User ID")}
                          className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60 hover:text-primary transition-colors uppercase tracking-widest font-medium"
                        >
                          <Fingerprint className="size-2.5" />
                          <span className="truncate w-32 text-left">{request.User.id}</span>
                        </button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <button 
                      onClick={() => copyToClipboard(request.User.email, "Email")}
                      className="inline-flex items-center gap-1.5 text-xs text-foreground/70 hover:text-primary transition-colors font-medium cursor-pointer"
                    >
                      <Mail className="size-3 opacity-60" />
                      {request.User.email}
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    {request.User.phoneNumber ? (
                      <button 
                        onClick={() => copyToClipboard(request.User.phoneNumber!, "Phone")}
                        className="inline-flex items-center gap-1.5 text-xs text-foreground/70 hover:text-primary transition-colors font-medium cursor-pointer"
                      >
                        <Phone className="size-3 opacity-60" />
                        {request.User.phoneNumber}
                      </button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40 italic uppercase tracking-tighter">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-bold text-[10px] uppercase tracking-widest px-3 py-1.5 bg-primary/5 text-primary rounded-lg border border-primary/10 shadow-sm">
                      {request.Course.title}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      className={cn(
                        "rounded-full px-4 py-1 text-[10px] font-black uppercase tracking-tighter",
                        request.status === "Granted" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : 
                        request.status === "Pending" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : 
                        "bg-rose-500/10 text-rose-600 border-rose-500/20"
                      )}
                      variant="outline"
                    >
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter tabular-nums opacity-60">
                      {formatIST(request.User.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter tabular-nums opacity-60">
                      {formatIST(request.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <ActionMenu 
                      request={request} 
                      isPending={isPending} 
                      onStatusUpdate={(id: string, status: any) => handleStatusUpdate(id, request, status)} 
                      onBanToggle={handleBanToggle} 
                      onDelete={handleDelete}
                      onEditOpen={(user) => {
                        setEditingUser(user);
                        setEditEmail(user.email);
                        setEditPhone(user.phoneNumber || "");
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* --- MOBILE CARD VIEW --- */}
      <div className="grid grid-cols-1 gap-4 lg:hidden">
        {data.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground bg-card/40 rounded-3xl border-2 border-dashed border-border/40">
            No requests found matching filters.
          </div>
        ) : (
          data.map((request) => (
            <div key={request.id} className="bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl p-5 shadow-xl space-y-5 relative overflow-hidden group transition-all">
              {/* Status Ribbon/Badge */}
              <div className="absolute top-0 right-0 p-4">
                 <Badge 
                    className={cn(
                      "rounded-full text-[9px] font-black uppercase tracking-tighter px-3 h-6",
                      request.status === "Granted" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : 
                      request.status === "Pending" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : 
                      "bg-rose-500/10 text-rose-600 border-rose-500/20"
                    )}
                    variant="outline"
                  >
                    {request.status}
                  </Badge>
              </div>

              {/* User Section */}
              <div className="flex items-center gap-4">
                <Avatar className="size-12 border-2 border-primary/20 shadow-md">
                  <AvatarImage src={request.User.image || ""} />
                  <AvatarFallback className="bg-primary/5 text-primary text-xs font-black uppercase">
                    {request.User.name.substring(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col justify-center">
                  <h3 className="font-black text-sm uppercase tracking-tight flex items-center gap-2">
                    {request.User.name}
                    {request.User.banned && <Badge variant="destructive" className="h-3 px-1 text-[7px] font-black">BANNED</Badge>}
                  </h3>
                  <button 
                    onClick={() => copyToClipboard(request.User.id, "User ID")}
                    className="text-[9px] text-muted-foreground font-black uppercase tracking-widest flex items-center gap-1 mt-1 font-mono opacity-50 active:opacity-100 transition-opacity"
                  >
                    <Fingerprint className="size-2.5" /> ID: {request.User.id.substring(0, 8)}...
                  </button>
                </div>
              </div>

              {/* Details List */}
              <div className="grid grid-cols-1 gap-3 border-y border-border/20 py-5">
                <DetailRow icon={Mail} label="Email" value={request.User.email} onCopy={() => copyToClipboard(request.User.email, "Email")} />
                <DetailRow icon={Phone} label="Phone" value={request.User.phoneNumber || "N/A"} onCopy={request.User.phoneNumber ? () => copyToClipboard(request.User.phoneNumber!, "Phone") : undefined} />
                <DetailRow icon={BookOpen} label="Course" value={request.Course.title} />
                <DetailRow icon={CalendarIcon} label="Requested" value={formatIST(request.createdAt)} />
                <DetailRow icon={CalendarIcon} label="Joined" value={formatIST(request.User.createdAt)} />
              </div>

              {/* Mobile Actions */}
              <div className="pt-2 flex items-center justify-end">
                <ActionMenu 
                  request={request} 
                  isPending={isPending} 
                  onStatusUpdate={(id: string, status: any) => handleStatusUpdate(id, request, status)} 
                  onBanToggle={handleBanToggle} 
                  onDelete={handleDelete}
                  onEditOpen={(user) => {
                    setEditingUser(user);
                    setEditEmail(user.email);
                    setEditPhone(user.phoneNumber || "");
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* --- LOAD MORE --- */}
      {hasMore && (
        <div className="flex justify-center pt-4 pb-8">
           <Button 
            variant="outline" 
            className="rounded-full px-8 font-black uppercase tracking-widest text-[10px] h-11 border-border/60 hover:bg-muted/50 transition-all hover:scale-105"
            onClick={loadMore}
            disabled={loadingMore}
           >
             {loadingMore ? (
               <>
                 <Loader2 className="mr-2 size-3 animate-spin" />
                 Loading...
               </>
             ) : (
               "Load More"
             )}
           </Button>
        </div>
      )}

      {/* --- EDIT DIALOG --- */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="sm:max-w-md border-2 border-border/40 bg-card/95 backdrop-blur-xl rounded-3xl p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
              <Edit className="size-5" />
            </div>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Edit User Details</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm font-medium">
              Update {editingUser?.name}'s contact information.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-6">
            <div className="space-y-3">
              <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
                <Input 
                  id="email" 
                  value={editEmail} 
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="pl-10 h-11 bg-muted/30 border-2 border-border/40 rounded-xl focus:border-primary/50 transition-all font-medium"
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label htmlFor="phone" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
                <Input 
                  id="phone" 
                  value={editPhone} 
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+1 234 567 890"
                  className="pl-10 h-11 bg-muted/30 border-2 border-border/40 rounded-xl focus:border-primary/50 transition-all font-medium"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="ghost" onClick={() => setEditingUser(null)} className="font-bold uppercase tracking-widest text-[10px] h-11 rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={isPending} className="font-bold uppercase tracking-widest text-[10px] h-11 px-8 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- CONFIRMATION DIALOG --- */}
      <AlertDialog open={confirmConfig.open} onOpenChange={(open) => !open && setConfirmConfig(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="border-2 border-border/40 bg-card/95 backdrop-blur-xl rounded-3xl p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black uppercase tracking-tighter">{confirmConfig.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-medium">
              {confirmConfig.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="font-bold uppercase tracking-widest text-[10px] h-11 rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                confirmConfig.onConfirm();
              }}
              className={cn(
                "font-bold uppercase tracking-widest text-[10px] h-11 px-8 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]",
                confirmConfig.isDestructive 
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-destructive/20" 
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
              )}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : confirmConfig.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, onCopy }: { icon: any, label: string, value: string, onCopy?: () => void }) {
  return (
    <div className="flex items-start justify-between text-[11px]">
      <div className="flex items-center gap-2 text-muted-foreground/60 font-black uppercase tracking-widest">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <button 
        disabled={!onCopy} 
        onClick={onCopy}
        className={cn("font-bold text-foreground text-right tracking-tight truncate ml-4", onCopy && "active:text-primary transition-all flex flex-row-reverse items-center gap-1.5")}
      >
        {value}
        {onCopy && <Copy className="size-3 text-primary/40" />}
      </button>
    </div>
  );
}

function ActionMenu({ 
  request, 
  isPending, 
  onStatusUpdate, 
  onBanToggle,
  onDelete,
  onEditOpen
}: { 
  request: Request, 
  isPending: boolean, 
  onStatusUpdate: any, 
  onBanToggle: any,
  onDelete: (id: string) => void,
  onEditOpen: (user: Request["User"]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 w-10 p-0 hover:bg-muted/80 rounded-full transition-colors" disabled={isPending}>
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl border-2 border-border/40 bg-card/95 backdrop-blur-xl shadow-2xl">
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 p-3">Manage Profile</DropdownMenuLabel>
        
        <DropdownMenuItem onClick={() => onEditOpen(request.User)} className="rounded-xl p-3 focus:bg-primary/5 group cursor-pointer border border-transparent focus:border-primary/10 transition-all mb-1">
          <Edit className="mr-3 h-4 w-4 text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
          <span className="font-bold text-xs uppercase tracking-tight">Edit Details</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border/20 my-2" />
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 p-3">Grant Access</DropdownMenuLabel>
        
        {request.status !== "Granted" && (
          <DropdownMenuItem onClick={() => onStatusUpdate(request.id, "Granted")} className="rounded-xl p-3 focus:bg-emerald-500/5 group cursor-pointer border border-transparent focus:border-emerald-500/10 transition-all mb-1">
            <CheckCircle className="mr-3 h-4 w-4 text-emerald-600 opacity-60 group-hover:opacity-100 transition-opacity" />
            <span className="font-bold text-xs uppercase tracking-tight">Approve Request</span>
          </DropdownMenuItem>
        )}
        
        {request.status !== "Revoked" && (
          <DropdownMenuItem onClick={() => onStatusUpdate(request.id, "Revoked")} className="rounded-xl p-3 focus:bg-rose-500/5 group cursor-pointer border border-transparent focus:border-rose-500/10 transition-all mb-1">
            <XCircle className="mr-3 h-4 w-4 text-rose-600 opacity-60 group-hover:opacity-100 transition-opacity" />
            <span className="font-bold text-xs uppercase tracking-tight">Revoke Access</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="bg-border/20 my-2" />
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 p-3">User Safety</DropdownMenuLabel>
        
        {request.User.banned ? (
          <DropdownMenuItem onClick={() => onBanToggle(request.User.id, true)} className="rounded-xl p-3 focus:bg-blue-500/5 group cursor-pointer border border-transparent focus:border-blue-500/10 transition-all">
            <ShieldCheck className="mr-3 h-4 w-4 text-blue-600 opacity-60 group-hover:opacity-100 transition-opacity" />
            <span className="font-bold text-xs uppercase tracking-tight">Unban User</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onBanToggle(request.User.id, false)} className="rounded-xl p-3 text-destructive focus:bg-destructive/5 group cursor-pointer border border-transparent focus:border-destructive/10 transition-all">
            <ShieldAlert className="mr-3 h-4 w-4 opacity-60 group-hover:opacity-100 transition-opacity" />
            <span className="font-bold text-xs uppercase tracking-tight">Ban User</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="bg-border/20 my-2" />
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 p-3">Danger Zone</DropdownMenuLabel>
        
        <DropdownMenuItem onClick={() => onDelete(request.id)} className="rounded-xl p-3 text-destructive focus:bg-destructive/5 group cursor-pointer border border-transparent focus:border-destructive/10 transition-all">
          <Trash2 className="mr-3 h-4 w-4 opacity-60 group-hover:opacity-100 transition-opacity" />
          <span className="font-bold text-xs uppercase tracking-tight">Delete Request</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
