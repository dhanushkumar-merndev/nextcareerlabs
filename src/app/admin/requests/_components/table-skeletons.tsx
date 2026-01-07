"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function RequestsTableSkeleton() {
  return (
    <div className="space-y-6">
      {/* Tabs & Filters Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex bg-muted/50 p-1 rounded-xl border border-border/50 gap-1 shrink-0">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto sm:ml-auto">
          <Skeleton className="h-8 w-36 rounded-full shrink-0" />
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Skeleton className="h-10 w-full sm:w-[300px] rounded-xl" />
          </div>
        </div>
      </div>

      {/* Desktop View Table Skeleton */}
      <div className="hidden lg:block rounded-2xl border bg-card/40 backdrop-blur-md overflow-hidden border-border/40 shadow-xl">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent border-border/40">
              <TableHead className="pl-6 h-12 w-[250px]"><Skeleton className="h-3 w-20" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-3 w-16 mx-auto" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-3 w-16 mx-auto" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-3 w-20 mx-auto" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-3 w-16 mx-auto" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-3 w-16 mx-auto" /></TableHead>
              <TableHead className="text-center"><Skeleton className="h-3 w-16 mx-auto" /></TableHead>
              <TableHead className="text-right pr-6"><Skeleton className="h-3 w-12 ml-auto" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="border-border/20">
                <TableCell className="pl-6 py-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center"><Skeleton className="h-4 w-32 mx-auto" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-4 w-28 mx-auto" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-6 w-24 mx-auto rounded-lg" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-5 w-16 mx-auto rounded-full" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-4 w-20 mx-auto" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-4 w-20 mx-auto" /></TableCell>
                <TableCell className="text-right pr-6"><Skeleton className="h-8 w-8 rounded-full ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View Skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl p-5 space-y-5">
            <div className="flex items-center gap-4">
              <Skeleton className="size-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="space-y-3 py-5 border-y border-border/20">
              <div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-32" /></div>
              <div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-32" /></div>
              <div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-24" /></div>
              <div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-20" /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
