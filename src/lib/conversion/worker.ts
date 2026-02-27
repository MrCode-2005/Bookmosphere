import { Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { ConversionJob } from "./queue";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "books";

/**
 * Download file from Supabase storage
 */
async function downloadFromSupabase(storageKey: string): Promise<Buffer> {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storageKey}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
}

/**
 * Upload file to Supabase storage
 */
async function uploadToSupabase(buffer: Buffer, storageKey: string): Promise<string> {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storageKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/epub+zip",
        },
        body: buffer,
    });
    if (!res.ok) throw new Error(`Failed to upload EPUB: ${res.statusText}`);
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storageKey}`;
}

/**
 * Run PDF→EPUB conversion using pdf-craft-main via Python subprocess
 */
async function convertPdfToEpub(
    pdfPath: string,
    epubPath: string,
    title: string,
    author?: string,
): Promise<void> {
    const scriptPath = join(process.cwd(), "scripts", "convert_pdf.py");
    const args = JSON.stringify({
        pdf_path: pdfPath,
        epub_path: epubPath,
        title,
        author: author || "",
    });

    return new Promise((resolve, reject) => {
        const proc = spawn("python3", [scriptPath, args], {
            cwd: process.cwd(),
            timeout: 600_000, // 10 min timeout
        });

        let stderr = "";
        proc.stderr.on("data", (data) => { stderr += data.toString(); });
        proc.stdout.on("data", (data) => { console.log(`[convert] ${data}`); });

        proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Conversion failed (exit ${code}): ${stderr}`));
        });
        proc.on("error", reject);
    });
}

/**
 * BullMQ worker that processes PDF→EPUB conversion jobs
 */
export function startConversionWorker() {
    const worker = new Worker<ConversionJob>(
        "pdf-to-epub",
        async (job) => {
            const { bookId, pdfStorageKey, title, author } = job.data;
            console.log(`🔄 Starting conversion for book ${bookId}`);

            // Update status to PROCESSING
            await prisma.book.update({
                where: { id: bookId },
                data: { conversionStatus: "PROCESSING", conversionError: null },
            });

            const tmpDir = join(tmpdir(), `bookconv-${bookId}`);
            await mkdir(tmpDir, { recursive: true });
            const pdfPath = join(tmpDir, "input.pdf");
            const epubPath = join(tmpDir, "output.epub");

            try {
                // Download PDF
                const pdfBuffer = await downloadFromSupabase(pdfStorageKey);
                await writeFile(pdfPath, pdfBuffer);

                // Convert
                await convertPdfToEpub(pdfPath, epubPath, title, author);

                // Read generated EPUB
                const { readFile } = await import("fs/promises");
                const epubBuffer = await readFile(epubPath);

                // Upload EPUB to Supabase
                const epubKey = pdfStorageKey.replace(/\.pdf$/i, ".epub");
                const epubUrl = await uploadToSupabase(epubBuffer, epubKey);

                // Update book record
                await prisma.book.update({
                    where: { id: bookId },
                    data: {
                        epubFileUrl: epubUrl,
                        conversionStatus: "COMPLETED",
                    },
                });

                console.log(`✅ Conversion complete for book ${bookId}`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`❌ Conversion failed for book ${bookId}:`, errorMsg);

                await prisma.book.update({
                    where: { id: bookId },
                    data: {
                        conversionStatus: "FAILED",
                        conversionError: errorMsg.slice(0, 1000),
                    },
                });
                throw error;
            } finally {
                // Cleanup temp files
                try { await unlink(pdfPath); } catch { /* ignore */ }
                try { await unlink(epubPath); } catch { /* ignore */ }
            }
        },
        {
            connection: new IORedis(REDIS_URL, { maxRetriesPerRequest: null }),
            concurrency: 2,
        },
    );

    worker.on("failed", (job, err) => {
        console.error(`Job ${job?.id} failed:`, err.message);
    });

    return worker;
}
