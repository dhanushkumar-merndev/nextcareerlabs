"use client";

const CACHE_KEY_PREFIX = "chat_cache_";
const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export const chatCache = {
  get: (key: string) => {
    if (typeof window === "undefined") return null;
    const cached = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!cached) return null;

    try {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > EXPIRY_MS) {
        localStorage.removeItem(CACHE_KEY_PREFIX + key);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  set: (key: string, data: any) => {
    if (typeof window === "undefined") return;
    const payload = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(payload));
  },

  clear: (key?: string) => {
    if (typeof window === "undefined") return;
    if (key) {
      localStorage.removeItem(CACHE_KEY_PREFIX + key);
    } else {
      // Clear all chat cache
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(CACHE_KEY_PREFIX)) {
          localStorage.removeItem(k);
        }
      });
    }
  }
};
