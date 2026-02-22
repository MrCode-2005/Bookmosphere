import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { uploadFile } from "@/lib/s3";
import { processBook } from "@/workers/bookProcessor";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES: Record<string, string> = {
    "application/pdf": "PDF",
    "application/epub+zip": "EPUB",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "text/plain": "TXT",
};

export async function POST(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const title = formData.get("title") as string | null;

        if (!file) {
            return NextResponse.json(
                { success: false, error: "No file provided" },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { success: false, error: "File too large (max 50MB)" },
                { status: 400 }
            );
        }

        // Determine file type
        const ext = file.name.split(".").pop()?.toLowerCase();
        let fileType = ALLOWED_TYPES[file.type];
        if (!fileType && ext) {
            const extMap: Record<string, string> = {
                pdf: "PDF", epub: "EPUB", docx: "DOCX", txt: "TXT",
            };
            fileType = extMap[ext];
        }

        if (!fileType) {
            return NextResponse.json(
                { success: false, error: "Unsupported file type" },
                { status: 400 }
            );
        }

        // Upload file
        const buffer = Buffer.from(await file.arrayBuffer());
        const key = `${payload.userId}/${Date.now()}-${file.name}`;
        const fileUrl = await uploadFile(key, buffer, file.type);

        // Create book record
        const book = await prisma.book.create({
            data: {
                title: title || file.name.replace(/\.[^.]+$/, ""),
                fileUrl,
                fileType: fileType as "PDF" | "EPUB" | "DOCX" | "TXT",
                totalPages: 0,
                totalWords: 0,
                status: "PROCESSING",
                userId: payload.userId,
                metadata: {
                    originalName: file.name,
                    fileSize: file.size,
                    uploadedAt: new Date().toISOString(),
                    storageKey: key,
                },
            },
        });

        // Process book synchronously for now (in dev, without BullMQ)
        // In production, this would be enqueued to BullMQ
        processBook(book.id, key).catch((err) => {
            console.error(`Failed to process book ${book.id}:`, err);
        });

        return NextResponse.json({
            success: true,
            book: {
                id: book.id,
                title: book.title,
                status: book.status,
                fileType: book.fileType,
            },
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }
        console.error("Upload error:", error);
        return NextResponse.json(
            { success: false, error: "Upload failed" },
            { status: 500 }
        );
    }
}
