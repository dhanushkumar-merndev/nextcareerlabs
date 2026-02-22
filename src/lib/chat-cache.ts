"use client";

import { secureStorage } from "./secure-storage";

const STORAGE_PREFIX = "chat_cache_";
export const PERMANENT_TTL = 100 * 365 * 24 * 60 * 60 * 1000;

// Initialize secureStorage (IDs shadowing + integrity check) on client side
if (typeof window !== "undefined") {
  secureStorage.init();
}
const DEFAULT_TTL = PERMANENT_TTL;

interface CacheEntry<T> {
  data: T;
  version?: string;
  timestamp?: number;
  expiry: number;
}

export const chatCache = {
  set: <T>(key: string, data: T, userId?: string, version?: string, ttl: number = DEFAULT_TTL) => {
    if (typeof window === "undefined" || !key) return;
    const storageKey = userId ? `${STORAGE_PREFIX}${userId}_${key}` : `${STORAGE_PREFIX}${key}`;
    const entry: CacheEntry<T> = {
      data,
      version,
      timestamp: Date.now(),
      expiry: Date.now() + ttl,
    };
    try {
      secureStorage.setItemTracked(storageKey, JSON.stringify(entry));
    } catch (e) {
      console.error("[chatCache] Failed to set", e);
    }
  },

  get: <T>(key: string, userId?: string): { data: T; version?: string; timestamp?: number } | null => {
    if (typeof window === "undefined" || !key) return null;
    const storageKey = userId ? `${STORAGE_PREFIX}${userId}_${key}` : `${STORAGE_PREFIX}${key}`;
    const item = secureStorage.getItem(storageKey);
    if (!item) return null;

    try {
      const entry: CacheEntry<T> = JSON.parse(item);

      if (Date.now() > entry.expiry) {
        secureStorage.removeItemTracked(storageKey);
        return null;
      }
      return { data: entry.data, version: entry.version, timestamp: entry.timestamp };
    } catch (e) {
      secureStorage.removeItemTracked(storageKey);
      return null;
    }
  },

  invalidate: (key: string, userId?: string) => {
    if (typeof window === "undefined") return;
    const storageKey = userId ? `${STORAGE_PREFIX}${userId}_${key}` : `${STORAGE_PREFIX}${key}`;
    secureStorage.removeItemTracked(storageKey);
  },

  clear: () => {
    if (typeof window === "undefined") return;
    secureStorage.clear(STORAGE_PREFIX);
  },

  invalidateAdminData: () => {
    if (typeof window === "undefined") return;
    const adminKeys = [
      "admin_analytics",
      "admin_dashboard_all",
      "admin_recent_courses",
      "admin_courses_list",
      "admin_chat_sidebar",
    ];
    adminKeys.forEach((key) => chatCache.invalidate(key));
    console.log("[chatCache] Admin data invalidated from local storage.");
  },

  invalidateUserDashboardData: (userId: string) => {
    if (typeof window === "undefined") return;
    
    const userPrefix = `${STORAGE_PREFIX}${userId}_`;
    const keysToRemove: string[] = [];

    // 1. Find all keys belonging to this user (Prefix Match)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(userPrefix)) {
        keysToRemove.push(key);
      }
    }

    // 2. Clear them all
    keysToRemove.forEach((key) => secureStorage.removeItemTracked(key));
    
    // 3. Clear auth_session (Shared across users)
    chatCache.invalidate("auth_session");
    
    console.log(`%c[chatCache] BROAD INVALIDATION: Cleared ${keysToRemove.length} user-specific keys for ${userId}`, "color: #ef4444; font-weight: bold");
  },

  /**
   * Updates only the timestamp of a cache entry.
   * Useful when server returns NOT_MODIFIED to prevent immediate re-checks.
   */
  touch: (key: string, userId?: string) => {
    if (typeof window === "undefined" || !key) return;
    const storageKey = userId ? `${STORAGE_PREFIX}${userId}_${key}` : `${STORAGE_PREFIX}${key}`;
    const item = secureStorage.getItem(storageKey);
    if (!item) return;

    try {
      const entry: CacheEntry<any> = JSON.parse(item);
      entry.timestamp = Date.now();
      secureStorage.setItemTracked(storageKey, JSON.stringify(entry));
    } catch (e) {
      // Ignore errors
    }
  },
};

export const getSidebarKey = (userId: string, isAdmin: boolean) =>
  ["chat_sidebar", userId, isAdmin] as const;

export const getSidebarLocalKey = (isAdmin: boolean) =>
  isAdmin ? "admin_chat_sidebar" : "user_chat_sidebar";