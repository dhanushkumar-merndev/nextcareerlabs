/**
 * UserList component for listing users and admins with pagination and search functionality.
 */

"use client";
import { getAllUsers, updateUserRole } from "@/app/admin/analytics/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, UserListProps } from "@/lib/types/analytic";
import { cn, formatIST } from "@/lib/utils";
import { InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy,Loader2,Mail,Phone,Search,ShieldCheck,User as UserIcon, RefreshCw} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";

export function UserList({
  initialUsers,
  initialHasNextPage,
  initialTotalUsers,
  search: initialSearch,
  version: initialVersion,
}: UserListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ref, inView } = useInView();
  const queryClient = useQueryClient();

  // Search state
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch] = useDebounce(searchTerm, 500);

  const [activeTab, setActiveTab] = useState("users"); // "users" | "admins"
  const [version, setVersion] = useState<string | null>(initialVersion || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const STORAGE_KEY = "admin_users_list_data";
  const VERSION_KEY = "admin_users_list_version";
  const LAST_CHECK_KEY = "admin_users_list_last_check";

  // Update URL when search changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const currentSearch = params.get("search") || "";

    if (debouncedSearch !== currentSearch) {
      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      } else {
        params.delete("search");
      }
      router.replace(`?${params.toString()}`);
    }
  }, [debouncedSearch, router, searchParams]);

  // Smart Sync: Sync server-passed data to local storage on mount
  useEffect(() => {
    if (activeTab !== "users" || debouncedSearch) return;

    const storedVersion = localStorage.getItem(VERSION_KEY);

    if (storedVersion && storedVersion === version) {
      console.log(`[UserList] LOCAL HIT: Cache matches server version (${version})`);
    } else if (version) {
      console.log(`[UserList] SYNC: New version from server (${version}). Hydrating local storage.`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
        users: initialUsers, 
        totalUsers: initialTotalUsers, 
        hasNextPage: initialHasNextPage 
      }));
      localStorage.setItem(VERSION_KEY, version);
    }
  }, [version, initialUsers, initialTotalUsers, initialHasNextPage, activeTab, debouncedSearch]);

  // Initial Sync from localStorage to state
  useEffect(() => {
    if (activeTab === "users" && !debouncedSearch && !version) {
      const storedVersion = localStorage.getItem(VERSION_KEY);
      if (storedVersion) {
        setVersion(storedVersion);
      }
    }
  }, [activeTab, debouncedSearch, version]);

  const queryKey = ["users", debouncedSearch, activeTab];

  type UsersPage = {
    users: User[];
    hasNextPage: boolean;
    totalUsers: number;
    version?: string;
    status?: string;
  };



  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useInfiniteQuery<UsersPage, Error, InfiniteData<UsersPage>>({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => {
      // Map tab to role filter expected by action
      const roleFilter = activeTab === "admins" ? "admin" : "user";
      
      // Pass client version only for page 1 default fetch
      const isFirstPageDefault = pageParam === 1 && !debouncedSearch && activeTab === "users";

      // 1. OPTIMIZATION: Check 30-min threshold BEFORE network trip
      if (isFirstPageDefault && typeof window !== 'undefined') {
        const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (lastCheck && storedData) {
          const now = Date.now();
          if (now - parseInt(lastCheck) < 1000 * 60 * 30) {
            console.log(`[UserList] CLIENT SKIP: Data is fresh. Skipping network.`);
            const parsed = JSON.parse(storedData);
            return { 
                users: parsed.users, 
                hasNextPage: parsed.hasNextPage, 
                totalUsers: parsed.totalUsers, 
                version: localStorage.getItem(VERSION_KEY) || version 
            } as UsersPage;
          }
        }
      }

      const clientV = isFirstPageDefault ? (localStorage.getItem(VERSION_KEY) || version) : undefined;

      const result = await getAllUsers(debouncedSearch, pageParam as number, 100, roleFilter, clientV || undefined);
      
      if ("status" in result && result.status === "not-modified") {
        console.log(`[UserList] Smart Sync: Server version matches. Cache is fresh.`);
        localStorage.setItem(LAST_CHECK_KEY, Date.now().toString()); // Reset expiration timer
        
        // Try to get from react-query cache first
        const existingData = queryClient.getQueryData<InfiniteData<UsersPage>>(queryKey);
        if (existingData?.pages[0]) return existingData.pages[0];

        // Fallback to localStorage if not in react-query cache
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            const parsed = JSON.parse(storedData);
            return { users: parsed.users, hasNextPage: parsed.hasNextPage, totalUsers: parsed.totalUsers } as UsersPage;
        }

        // Final fallback to props (if any)
        return { users: initialUsers || [], hasNextPage: initialHasNextPage || false, totalUsers: initialTotalUsers || 0 } as UsersPage;
      }

      if (isFirstPageDefault && result.users) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ users: result.users, totalUsers: result.totalUsers, hasNextPage: result.hasNextPage }));
        localStorage.setItem(VERSION_KEY, result.version!);
        localStorage.setItem(LAST_CHECK_KEY, Date.now().toString()); // Update last check time
        setVersion(result.version!);
      }

      return result as UsersPage;
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasNextPage ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  // Flatten users and get total count from latest page or initial
  const users = data?.pages.flatMap((page) => page.users) || [];
  const totalUsers = data?.pages[0]?.totalUsers || 0;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };
  // Handle role update
  const handleRoleUpdate = async (userId: string, newRole: string) => {
    toast.loading("Updating role...");
    const result = await updateUserRole(userId, newRole);
    toast.dismiss();

    if (result.success) {
      toast.success("User role updated");
      // Invalidate queries to refresh list (user should move tabs)
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } else {
      toast.error(result.error || "Failed to update role");
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      localStorage.removeItem(VERSION_KEY); // Force fresh fetch
      localStorage.removeItem(LAST_CHECK_KEY); // Force refresh check timer
      await queryClient.fetchInfiniteQuery({ 
        queryKey: ["users", debouncedSearch, activeTab],
        initialPageParam: 1
      });
      toast.success("Users list updated");
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <TabsList className="bg-muted/40 p-1">
            <TabsTrigger value="users" className="px-6">Users</TabsTrigger>
            <TabsTrigger value="admins" className="px-6">Admins</TabsTrigger>
          </TabsList>

          {/* Search Input */}
          <div className="flex gap-2">
              <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 bg-muted/30 border-border/40 rounded-xl focus:border-primary/50 transition-all font-medium text-[13px]"
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={handleManualRefresh}
            disabled={isRefreshing || isLoading}
            className="h-10 w-10 rounded-xl border-border/40 bg-card/40 backdrop-blur-sm hover:bg-muted/50 transition-all shadow-sm"
            title="Sync with Server"
          >
            <RefreshCw className={cn("size-4", (isRefreshing || isLoading) && "animate-spin text-primary")} />
          </Button>
        </div>

          </div>
        
        {/* --- DESKTOP VIEW --- */}
        <div className="hidden lg:block rounded-2xl border bg-card/40 backdrop-blur-md overflow-hidden border-border/40 shadow-xl">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="pl-6 font-black uppercase tracking-widest text-[10px] h-12">
                  User Profile
                </TableHead>
                <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">
                  User ID
                </TableHead>
                <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">
                  Email
                </TableHead>
                <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">
                  Phone
                </TableHead>
                <TableHead className="text-center font-black uppercase tracking-widest text-[10px]">
                  Role
                </TableHead>
                <TableHead className="text-right pr-6 font-black uppercase tracking-widest text-[10px]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-48 text-center text-muted-foreground/60 italic"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <UserIcon className="size-10 opacity-20" />
                      <p className="text-sm font-medium">
                        No {activeTab} found.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="hover:bg-muted/10 transition-colors border-border/20 group"
                  >
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="size-10 border-2 border-primary/20 shadow-sm">
                          <AvatarImage src={user.image || ""} />
                          <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-black uppercase">
                            {user.name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm uppercase tracking-tight">
                              {user.name}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => copyToClipboard(user.id, "User ID")}
                        className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors uppercase tracking-widest font-mono font-medium group/id"
                      >
                        <span className="truncate w-24">
                          {user.id}
                        </span>
                        <Copy className="size-2.5 opacity-0 group-hover/id:opacity-100 transition-opacity" />
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => copyToClipboard(user.email, "Email")}
                        className="inline-flex items-center gap-1.5 text-xs text-foreground/70 hover:text-primary transition-colors font-medium cursor-pointer"
                      >
                        <Mail className="size-3 opacity-60" />
                        {user.email}
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      {user.phoneNumber ? (
                        <button
                          onClick={() => copyToClipboard(user.phoneNumber!, "Phone Number")}
                          className="inline-flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground font-medium hover:text-primary transition-all"
                        >
                          <Phone className="size-3 opacity-60" />
                          {user.phoneNumber}
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40 italic">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Badge
                            className={cn(
                              "rounded-full px-4 py-1 text-[10px] font-black uppercase tracking-tighter cursor-pointer hover:bg-opacity-80 transition-all",
                              user.role === "admin" ? "bg-purple-500/10 text-purple-600 border-purple-500/20" :
                                "bg-blue-500/10 text-blue-600 border-blue-500/20"
                            )}
                            variant="outline"
                          >
                            {user.role || "User"}
                          </Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel className="text-xs">Change Role</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleRoleUpdate(user.id, "user")}>
                            <UserIcon className="mr-2 h-4 w-4" />
                            <span>User</span>
                            {(user.role !== "admin") && <Check className="ml-auto h-4 w-4" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRoleUpdate(user.id, "admin")}>
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            <span>Admin</span>
                            {user.role === "admin" && <Check className="ml-auto h-4 w-4" />}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button asChild size="sm" variant="default" className="h-8 text-[10px] uppercase font-black tracking-widest">
                        <Link href={`/admin/analytics/users/${user.id}`}>
                          View Analytics
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {isFetchingNextPage && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading more users...</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* --- MOBILE CARD VIEW --- */}
        <div className="grid grid-cols-1 gap-4 lg:hidden">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground bg-card/40 rounded-3xl border-2 border-dashed border-border/40">
              No users found.
            </div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl p-5 shadow-xl space-y-5 relative overflow-hidden group">
                {/* Role Ribbon */}
                <div className="absolute top-0 right-0 p-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Badge
                        className={cn(
                          "rounded-full text-[9px] font-black uppercase tracking-tighter px-3 h-6 cursor-pointer",
                          user.role === "admin" ? "bg-purple-500/10 text-purple-600 border-purple-500/20" :
                            "bg-blue-500/10 text-blue-600 border-blue-500/20"
                        )}
                        variant="outline"
                      >
                        {user.role || "User"}
                      </Badge>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="text-xs">Change Role</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleRoleUpdate(user.id, "user")}>
                        <span>User</span>
                        {(user.role !== "admin") && <Check className="ml-auto h-4 w-4" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRoleUpdate(user.id, "admin")}>
                        <span>Admin</span>
                        {user.role === "admin" && <Check className="ml-auto h-4 w-4" />}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* User Section */}
                <div className="flex items-center gap-4">
                  <Avatar className="size-12 border-2 border-primary/20 shadow-md">
                    <AvatarImage src={user.image || ""} />
                    <AvatarFallback className="bg-primary/5 text-primary text-xs font-black uppercase">
                      {user.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col justify-center">
                    <h3 className="font-black text-sm uppercase tracking-tight flex items-center gap-2">
                      {user.name}
                    </h3>
                    <button
                      onClick={() => copyToClipboard(user.id, "User ID")}
                      className="text-[9px] text-muted-foreground font-black uppercase tracking-widest flex items-center gap-1 mt-1 font-mono opacity-50 active:opacity-100 transition-opacity"
                    >
                      ID: {user.id.substring(0, 8)}...
                    </button>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 gap-3 border-y border-border/20 py-5">
                  <div className="flex items-start justify-between text-[11px]">
                    <div className="flex items-center gap-2 text-muted-foreground/60 font-black uppercase tracking-widest">
                      <Mail className="size-3.5" />
                      <span>Email</span>
                    </div>
                    <button onClick={() => copyToClipboard(user.email, 'Email')} className="font-bold text-foreground text-right tracking-tight truncate ml-4 active:text-primary transition-all">
                      {user.email}
                    </button>
                  </div>
                  {user.phoneNumber && (
                    <div className="flex items-start justify-between text-[11px]">
                      <div className="flex items-center gap-2 text-muted-foreground/60 font-black uppercase tracking-widest">
                        <Phone className="size-3.5" />
                        <span>Phone</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(user.phoneNumber!, 'Phone Number')}
                        className="font-bold text-foreground text-right tracking-tight truncate ml-4 active:text-primary transition-all hover:text-primary"
                      >
                        {user.phoneNumber}
                      </button>
                    </div>
                  )}
                  <div className="flex items-start justify-between text-[11px]">
                    <div className="flex items-center gap-2 text-muted-foreground/60 font-black uppercase tracking-widest">
                      <ShieldCheck className="size-3.5" />
                      <span>Joined</span>
                    </div>
                    <span className="font-bold text-foreground text-right tracking-tight truncate ml-4">
                      {formatIST(user.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <Button asChild size="sm" className="w-full text-xs font-bold">
                    <Link href={`/admin/analytics/users/${user.id}`}>
                      View Analytics
                    </Link>
                  </Button>
                </div>
              </div>
            ))
          )}
          {isFetchingNextPage && (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        {/* Invisible element to trigger fetch next page */}
        <div ref={ref} className="h-1" />
      </Tabs>
    </div>
  );
}
// ActionMenu removed as per request
