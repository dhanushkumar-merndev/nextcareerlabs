/**
 * Utility to throttle API calls using localStorage to persist state across reloads.
 */

export interface ThrottleConfig {
  limit: number;      // Maximum calls
  windowMs: number;   // Time window in milliseconds
}

export const API_THROTTLE_CONFIG = {
  READ_OPERATIONS: {
    limit: 3,
    windowMs: 30 * 60 * 1000, // 30 minutes
  }
};

class ApiThrottle {
  private getStorageKey(key: string): string {
    return `api_throttle_${key}`;
  }

  private getTimestamps(key: string): number[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(this.getStorageKey(key));
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  private saveTimestamps(key: string, timestamps: number[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.getStorageKey(key), JSON.stringify(timestamps));
  }

  /**
   * Checks if an API call can be made based on the throttle config.
   */
  canCall(key: string, config: ThrottleConfig): boolean {
    const now = Date.now();
    const timestamps = this.getTimestamps(key);
    
    // Filter timestamps within the window
    const recentCalls = timestamps.filter(t => (now - t) < config.windowMs);
    
    return recentCalls.length < config.limit;
  }

  /**
   * Records a new API call attempt.
   */
  recordCall(key: string): void {
    const now = Date.now();
    const timestamps = this.getTimestamps(key);
    timestamps.push(now);
    
    // Housekeeping: keep only the last N + some buffer or just keep all and filter on get
    this.saveTimestamps(key, timestamps);
  }

  /**
   * Gets the remaining time until the next slot becomes available (in ms).
   */
  getTimeUntilNext(key: string, config: ThrottleConfig): number {
    const now = Date.now();
    const timestamps = this.getTimestamps(key);
    const recentCalls = timestamps.filter(t => (now - t) < config.windowMs);
    
    if (recentCalls.length < config.limit) return 0;
    
    // The next slot opens when the oldest call in the window expires
    const oldest = Math.min(...recentCalls);
    return Math.max(0, config.windowMs - (now - oldest));
  }
}

export const apiThrottle = new ApiThrottle();
