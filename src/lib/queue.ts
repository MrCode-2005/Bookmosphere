import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

// ─── Book Processing Queue ───

export const bookProcessingQueue = new Queue("book-processing", {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 2000,
        },
        removeOnComplete: {
            count: 100,
            age: 24 * 3600, // 24 hours
        },
        removeOnFail: {
            count: 50,
        },
    },
});

// ─── Job Types ───

export interface BookProcessingJobData {
    bookId: string;
    userId: string;
    fileUrl: string;
    fileType: "PDF" | "EPUB" | "DOCX" | "TXT";
    s3Key: string;
}

// ─── Queue Helpers ───

export async function addBookProcessingJob(
    data: BookProcessingJobData
): Promise<Job<BookProcessingJobData>> {
    return bookProcessingQueue.add("process-book", data, {
        jobId: `book-${data.bookId}`,
    });
}

export async function getJobStatus(bookId: string) {
    const job = await bookProcessingQueue.getJob(`book-${bookId}`);
    if (!job) return null;

    const state = await job.getState();
    return {
        id: job.id,
        state,
        progress: job.progress,
        failedReason: job.failedReason,
    };
}

export { connection as queueConnection };
