/**
 * In-memory rate limiter for API routes.
 * Uses a sliding window approach with per-IP and per-user tracking.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
if (typeof globalThis !== "undefined") {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store.entries()) {
            if (entry.resetAt < now) store.delete(key);
        }
    }, 5 * 60 * 1000);
}

interface RateLimitOptions {
    windowMs?: number;    // Time window in milliseconds (default: 60s)
    maxRequests?: number; // Max requests per window (default: 60)
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

/**
 * Check if a request should be rate limited.
 * @param identifier — IP address, user ID, or any unique key
 * @param options — rate limit configuration
 */
export function checkRateLimit(
    identifier: string,
    options: RateLimitOptions = {}
): RateLimitResult {
    const { windowMs = 60_000, maxRequests = 60 } = options;
    const now = Date.now();
    const key = identifier;

    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        // New window
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    entry.count++;

    if (entry.count > maxRequests) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// Preset configurations for different routes
export const RATE_LIMITS = {
    auth: { windowMs: 15 * 60_000, maxRequests: 10 },     // 10 per 15min
    upload: { windowMs: 60_000, maxRequests: 5 },           // 5 per minute
    search: { windowMs: 60_000, maxRequests: 30 },          // 30 per minute
    api: { windowMs: 60_000, maxRequests: 60 },             // 60 per minute (default)
};
