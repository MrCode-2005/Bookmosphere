import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
    redis: Redis | undefined;
};

function createRedisClient(): Redis {
    const url = process.env.REDIS_URL || "redis://localhost:6379";

    const client = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        lazyConnect: true,
    });

    client.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
    });

    client.on("connect", () => {
        console.log("[Redis] Connected successfully");
    });

    return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// ─── Cache Helpers ───

export async function getCache<T>(key: string): Promise<T | null> {
    try {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

export async function setCache(
    key: string,
    data: unknown,
    ttlSeconds: number = 300
): Promise<void> {
    try {
        await redis.setex(key, ttlSeconds, JSON.stringify(data));
    } catch (err) {
        console.error("[Redis] Cache set error:", err);
    }
}

export async function deleteCache(key: string): Promise<void> {
    try {
        await redis.del(key);
    } catch (err) {
        console.error("[Redis] Cache delete error:", err);
    }
}

export async function deleteCachePattern(pattern: string): Promise<void> {
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    } catch (err) {
        console.error("[Redis] Cache pattern delete error:", err);
    }
}

export default redis;
