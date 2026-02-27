import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let connection: IORedis | null = null;

function getConnection() {
    if (!connection) {
        connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    }
    return connection;
}

export const conversionQueue = new Queue("pdf-to-epub", {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});

export interface ConversionJob {
    bookId: string;
    pdfStorageKey: string;
    title: string;
    author?: string;
}

export async function queueConversion(job: ConversionJob) {
    await conversionQueue.add("convert", job, {
        jobId: `convert-${job.bookId}`,
    });
}
