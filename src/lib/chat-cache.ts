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
  set: <T>(
    key: string,
    data: T,
    userId?: string,
    version?: string,
    ttl: number = DEFAULT_TTL,
  ) => {
    const t0 = Date.now();
    if (typeof window === "undefined" || !key) return;
    const storageKey = userId
      ? `${STORAGE_PREFIX}${userId}_${key}`
      : `${STORAGE_PREFIX}${key}`;
    const entry: CacheEntry<T> = {
      data,
      version,
      timestamp: Date.now(),
      expiry: Date.now() + ttl,
    };
    try {
      secureStorage.setItemTracked(storageKey, JSON.stringify(entry));
      console.log(`%c[LocalCache] SET — ${key}${userId ? ` (user:${userId.slice(0,8)})` : ''} v:${version?.slice(0,8)||'none'} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
    } catch {
      console.error(`[chatCache] Failed to set ${key}`);
    }
  },

  get: <T>(
    key: string,
    userId?: string,
  ): { data: T; version?: string; timestamp?: number } | null => {
    const t0 = Date.now();
    if (typeof window === "undefined" || !key) return null;
    const storageKey = userId
      ? `${STORAGE_PREFIX}${userId}_${key}`
      : `${STORAGE_PREFIX}${key}`;
    const item = secureStorage.getItem(storageKey);
    if (!item) {
      console.log(`%c[LocalCache] MISS — ${key}${userId ? ` (user:${userId.slice(0,8)})` : ''} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
      return null;
    }

    try {
      const entry: CacheEntry<T> = JSON.parse(item);

      if (Date.now() > entry.expiry) {
        secureStorage.removeItemTracked(storageKey);
        console.log(`%c[LocalCache] EXPIRED — ${key} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
        return null;
      }
      console.log(`%c[LocalCache] HIT — ${key}${userId ? ` (user:${userId.slice(0,8)})` : ''} v:${entry.version?.slice(0,8)||'none'} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
      return {
        data: entry.data,
        version: entry.version,
        timestamp: entry.timestamp,
      };
    } catch {
      secureStorage.removeItemTracked(storageKey);
      console.log(`%c[LocalCache] PARSE_ERR — ${key} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
      return null;
    }
  },

  invalidate: (key: string, userId?: string) => {
    const t0 = Date.now();
    if (typeof window === "undefined") return;
    const storageKey = userId
      ? `${STORAGE_PREFIX}${userId}_${key}`
      : `${STORAGE_PREFIX}${key}`;
    secureStorage.removeItemTracked(storageKey);
    console.log(`%c[LocalCache] INVALIDATE — ${key}${userId ? ` (user:${userId.slice(0,8)})` : ''} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
  },

  clear: () => {
    const t0 = Date.now();
    if (typeof window === "undefined") return;
    secureStorage.clear(STORAGE_PREFIX);
    console.log(`%c[LocalCache] CLEAR — all entries (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
  },

  invalidateAdminData: () => {
    const t0 = Date.now();
    if (typeof window === "undefined") return;
    const adminKeys = [
      "admin_analytics", "admin_static_analytics", "admin_analytics_growth",
      "admin_success_rate", "admin_analytics_version", "admin_dashboard_all",
      "admin_recent_courses", "admin_courses_list", "admin_chat_sidebar", "admin_resource_page",
    ];
    adminKeys.forEach((key) => chatCache.invalidate(key));

    const allKeys = secureStorage.keysByPrefix(STORAGE_PREFIX);
    let participantCount = 0;
    allKeys.forEach((origKey) => {
      if (origKey.includes("participants_")) {
        secureStorage.removeItemTracked(origKey);
        participantCount++;
      }
    });
    console.log(`%c[LocalCache] invalidateAdminData — ${adminKeys.length} keys + ${participantCount} participant caches (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
  },
  invalidateUserDashboardData: (userId: string) => {
    const t0 = Date.now();
    if (typeof window === "undefined") return;

    // ✅ chatCache.invalidate builds the storage key internally
    const keys = ["user_dashboard", "user_enrolled_courses", "available_courses",
      "user_needs_sync", "all_courses", "my_courses", "user_resources",
      "user_resources_access", "enrolled_courses"];
    keys.forEach((key) => {
      if (key === "all_courses") chatCache.invalidate(key);
      else chatCache.invalidate(key, userId);
    });
    console.log(`%c[LocalCache] invalidateUserDashboardData — ${keys.length} keys (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
  },

  invalidateAllCourseData: () => {
    const t0 = Date.now();
    if (typeof window === "undefined") return;

    chatCache.invalidate("all_courses");

    const allKeys = secureStorage.keysByPrefix(STORAGE_PREFIX);
    let removed = 0;
    allKeys.forEach((origKey) => {
      if (origKey.includes("course_") || origKey.includes("available_courses_") || origKey.includes("user_dashboard_")) {
        secureStorage.removeItemTracked(origKey);
        removed++;
      }
    });
    console.log(`%c[LocalCache] invalidateAllCourseData — removed ${removed} entries (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
  },

  /**
   * Updates only the timestamp of a cache entry.
   */
  touch: (key: string, userId?: string) => {
    const t0 = Date.now();
    if (typeof window === "undefined" || !key) return;
    const storageKey = userId
      ? `${STORAGE_PREFIX}${userId}_${key}`
      : `${STORAGE_PREFIX}${key}`;
    const item = secureStorage.getItem(storageKey);
    if (!item) {
      console.log(`%c[LocalCache] TOUCH MISS — ${key} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
      return;
    }
    try {
      const entry = JSON.parse(item) as CacheEntry<unknown>;
      entry.timestamp = Date.now();
      secureStorage.setItemTracked(storageKey, JSON.stringify(entry));
      console.log(`%c[LocalCache] TOUCH — ${key} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
    } catch {
      console.log(`%c[LocalCache] TOUCH ERR — ${key} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
    }
  },

  /**
   * Sync flag helpers — controls dynamic staleTime across user pages.
   * Set on mutation (enroll, lesson complete), cleared after sync.
   */
  setNeedsSync: (userId: string) => {
    console.log(`%c[LocalCache] setNeedsSync — ${userId.slice(0, 8)}`, "color:#eab308; font-weight:bold");
    chatCache.set("user_needs_sync", true, userId);
  },

  needsSync: (userId: string): boolean => {
    const result = !!chatCache.get<boolean>("user_needs_sync", userId);
    if (result) console.log(`%c[LocalCache] needsSync YES — ${userId.slice(0, 8)}`, "color:#eab308; font-weight:bold");
    return result;
  },

  clearSync: (userId: string) => {
    console.log(`%c[LocalCache] clearSync — ${userId.slice(0, 8)}`, "color:#eab308; font-weight:bold");
    chatCache.invalidate("user_needs_sync", userId);
  },

  hasAnyPending: (userId: string): boolean => {
    const t0 = Date.now();
    if (typeof window === "undefined") return false;

    const knownLists = ["all_courses", `available_courses_${userId}`];
    for (const key of knownLists) {
      const cached = chatCache.get<{ data?: { data?: Array<{ enrollmentStatus: string | null }> } }>(key, userId);
      const nestedData = cached?.data?.data;
      if (Array.isArray(nestedData) && nestedData.some((c: { enrollmentStatus: string | null }) => c.enrollmentStatus === "Pending")) {
        console.log(`%c[LocalCache] hasAnyPending YES — ${key} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
        return true;
      }
    }

    const allKeys = secureStorage.keysByPrefix(STORAGE_PREFIX);
    for (const origKey of allKeys) {
      if (origKey.includes(`course_`) && origKey.includes(userId)) {
        const item = secureStorage.getItem(origKey);
        if (item) {
          try {
            const entry = JSON.parse(item);
            if (entry.data?.enrollmentStatus === "Pending") {
              console.log(`%c[LocalCache] hasAnyPending YES — ${origKey.slice(0, 40)} (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
              return true;
            }
          } catch {}
        }
      }
    }
    console.log(`%c[LocalCache] hasAnyPending NO — (${Date.now() - t0}ms)`, "color:#eab308; font-weight:bold");
    return false;
  },
};

export const getSidebarKey = (
  userId: string | undefined | null,
  isAdmin: boolean,
) =>
  isAdmin
    ? (["admin_chat_sidebar_key"] as const)
    : (["chat_sidebar", userId] as const);

export const getSidebarLocalKey = (isAdmin: boolean) =>
  isAdmin ? "admin_chat_sidebar" : "user_chat_sidebar";
