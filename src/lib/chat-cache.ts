const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const CACHE_PREFIX = "chat_cache_";
const TIMER_KEY = "chat_last_fetch_time";

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class ChatCache {
    private getLastFetchTime(): number {
        try {
            const stored = localStorage.getItem(TIMER_KEY);
            return stored ? parseInt(stored, 10) : 0;
        } catch {
            return 0;
        }
    }

    private setLastFetchTime(time: number) {
        try {
            localStorage.setItem(TIMER_KEY, time.toString());
        } catch {
            // Ignore storage errors
        }
    }

    // Check if we should fetch new data (returns true only if 10 minutes have passed)
    shouldFetch(): boolean {
        const lastFetch = this.getLastFetchTime();
        const now = Date.now();
        const timeSinceLastFetch = now - lastFetch;

        return timeSinceLastFetch >= CACHE_DURATION || lastFetch === 0;
    }

    // Mark that a fetch has occurred
    markFetched() {
        this.setLastFetchTime(Date.now());
    }

    get<T>(key: string): T | null {
        try {
            const item = localStorage.getItem(CACHE_PREFIX + key);
            if (!item) return null;

            const entry: CacheEntry<T> = JSON.parse(item);
            const now = Date.now();

            if (now - entry.timestamp > CACHE_DURATION) {
                this.clear(key);
                return null;
            }

            return entry.data;
        } catch {
            return null;
        }
    }

    set<T>(key: string, data: T) {
        try {
            const entry: CacheEntry<T> = {
                data,
                timestamp: Date.now(),
            };
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
        } catch {
            // Ignore storage errors
        }
    }

    clear(key: string) {
        try {
            localStorage.removeItem(CACHE_PREFIX + key);
        } catch {
            // Ignore storage errors
        }
    }

    clearAll() {
        try {
            Object.keys(localStorage).forEach((key) => {
                if (key.startsWith(CACHE_PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
            localStorage.removeItem(TIMER_KEY);
        } catch {
            // Ignore storage errors
        }
    }
}

export const chatCache = new ChatCache();