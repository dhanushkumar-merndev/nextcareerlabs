"use client";

const STORAGE_PREFIX = "chat_cache_";
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

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
        localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (e) {
        console.error("[chatCache] Failed to set", e);
    }
  },

  get: <T>(key: string, userId?: string): { data: T; version?: string; timestamp?: number } | null => {
    if (typeof window === "undefined" || !key) return null;
    const storageKey = userId ? `${STORAGE_PREFIX}${userId}_${key}` : `${STORAGE_PREFIX}${key}`;
    const item = localStorage.getItem(storageKey);
    if (!item) return null;

    try {
      const entry: CacheEntry<T> = JSON.parse(item);

      // Check if cache is older than 30 seconds for sidebar data
      if (key === "sidebarData" && entry.timestamp) {
        const age = Date.now() - entry.timestamp;
        if (age > 30000) { // 30 seconds
          console.log(`[ChatCache] Sidebar cache expired (${Math.round(age / 1000)}s old), ignoring`);
          chatCache.invalidate(key, userId); // Use chatCache.invalidate
          return null;
        }
      }

      if (Date.now() > entry.expiry) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return { data: entry.data, version: entry.version };
    } catch (e) {
      localStorage.removeItem(storageKey);
      return null;
    }
  },

  invalidate: (key: string, userId?: string) => {
    if (typeof window === "undefined") return;
    const storageKey = userId ? `${STORAGE_PREFIX}${userId}_${key}` : `${STORAGE_PREFIX}${key}`;
    localStorage.removeItem(storageKey);
  },

  clear: () => {
    if (typeof window === "undefined") return;
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  },
};