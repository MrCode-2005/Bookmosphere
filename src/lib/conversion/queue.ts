import type { Queue as QueueType } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let _queue: QueueType | null = null;

/**
 * Lazy-initialize the BullMQ queue.
 * This prevents Redis connection at module import time,
 * which would crash Vercel serverless functions during cold start.
 */
async function getQueue(): Promise<QueueType> {
    if (!_queue) {
        const { Queue } = await import("bullmq");
        const IORedis = (await import("ioredis")).default;
        const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _queue = new Queue("pdf-to-epub", {
            connection: connection as any,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: 100,
                removeOnFail: 50,
            },
        });
    }
    return _queue;
}

export interface ConversionJob {
    bookId: string;
    pdfStorageKey: string;
    title: string;
    author?: string;
}

export async function queueConversion(job: ConversionJob) {
    const queue = await getQueue();
    await queue.add("convert", job, {
        jobId: `convert-${job.bookId}`,
    });
}
