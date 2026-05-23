"use client";

import React, { useState } from "react";
import { IconTool } from "@tabler/icons-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const TROUBLESHOOT_KEY = "ts_btn_usage";
const MAX_USES_PER_DAY = 3;

interface UsageData {
  count: number;
  date: string;
}

function readStoredUsage(): UsageData {
  const today = new Date().toISOString().split("T")[0];
  try {
    const stored = localStorage.getItem(TROUBLESHOOT_KEY);
    if (stored) {
      const data: UsageData = JSON.parse(stored);
      if (data.date === today) return data;
    }
  } catch {}
  return { count: 0, date: today };
}

export function TroubleshootButton() {
  const [usage, setUsage] = useState<UsageData>(readStoredUsage);

  const handleTroubleshoot = async () => {
    if (usage.count >= MAX_USES_PER_DAY) {
      toast.error(`Limit reached: ${MAX_USES_PER_DAY} times per day only.`);
      return;
    }

    try {
      // 1. Clear LocalStorage (except our tracking key)
      const usageStr = localStorage.getItem(TROUBLESHOOT_KEY);
      localStorage.clear();
      if (usageStr) {
        localStorage.setItem(TROUBLESHOOT_KEY, usageStr);
      }

      // 2. Clear IndexedDB
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          window.indexedDB.deleteDatabase(db.name);
        }
      }

      // 3. Update usage
      const newCount = usage.count + 1;
      const updatedUsage = { ...usage, count: newCount };
      localStorage.setItem(TROUBLESHOOT_KEY, JSON.stringify(updatedUsage));
      setUsage(updatedUsage);

      toast.success("Troubleshoot successful! Refreshing...");

      // 4. Refresh page
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Troubleshoot failed:", error);
      toast.error("Failed to troubleshoot.");
    }
  };

  const isLimitReached = usage.count >= MAX_USES_PER_DAY;

  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.preventDefault();
        handleTroubleshoot();
      }}
      disabled={isLimitReached}
    >
      <IconTool className="size-4" />
      <span className="text-sm font-medium">Troubleshoot</span>
    </DropdownMenuItem>
  );
}
