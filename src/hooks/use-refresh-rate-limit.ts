"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

/**
 * Hook to enforce a rate limit on manual refreshes.
 * Default: 5 refreshes per 60 seconds.
 */
export function useRefreshRateLimit(limit: number = 5, windowMs: number = 60000) {
    const [refreshTimestamps, setRefreshTimestamps] = useState<number[]>([]);

    const checkRateLimit = useCallback(() => {
        const now = Date.now();
        
        // Remove timestamps older than the window
        const recentRefreshes = refreshTimestamps.filter(
            (timestamp) => now - timestamp < windowMs
        );

        if (recentRefreshes.length >= limit) {
            const oldestInWindow = recentRefreshes[0];
            const waitSeconds = Math.ceil((windowMs - (now - oldestInWindow)) / 1000);
            
            toast.error(`Rate limit reached. Please wait ${waitSeconds}s before trying again.`);
            return false;
        }

        const newTimestamps = [...recentRefreshes, now];
        const attemptsLeft = limit - newTimestamps.length;
        
        // Add current timestamp and update state
        setRefreshTimestamps(newTimestamps);
        
        if (attemptsLeft > 0) {
            toast.success(`Sync request sent. (${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining)`);
        } else {
            toast.warning(`Sync request sent. This was your last attempt for this minute.`);
        }
        
        return true;
    }, [refreshTimestamps, limit, windowMs]);

    return { checkRateLimit };
}
