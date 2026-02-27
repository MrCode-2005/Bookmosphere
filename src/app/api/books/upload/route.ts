import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { processBook } from "@/workers/bookProcessor";
import { validateFileName, validateFileSize, checkRateLimit, sanitizeFileName } from "@/lib/security/fileValidation";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "books";

const ALLOWED_TYPES: Record<string, string> = {
    "application/pdf": "PDF",
    "application/epub+zip": "EPUB",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "text/plain": "TXT",
};

// Step 1: Client calls this to get a signed upload URL + create book record
export async function POST(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const body = await req.json();
        const { fileName, fileSize, fileType: mimeType, title } = body;

        if (!fileName || !fileSize || !mimeType) {
            return NextResponse.json(
                { success: false, error: "fileName, fileSize, and fileType are required" },
                { status: 400 }
            );
        }

        // Security: Rate limiting
        const rateCheck = checkRateLimit(payload.userId, 20, 60000);
        if (!rateCheck.valid) {
            return NextResponse.json(
                { success: false, error: rateCheck.error },
                { status: 429 }
            );
        }

        // Security: Validate file name
        const nameCheck = validateFileName(fileName);
        if (!nameCheck.valid) {
            return NextResponse.json(
                { success: false, error: nameCheck.error },
                { status: 400 }
            );
        }

        // Validate file size (type-specific limits)
        if (fileSize > 50 * 1024 * 1024) {
            return NextResponse.json(
                { success: false, error: "File too large (max 50MB)" },
                { status: 400 }
            );
        }

        // Determine file type
        const ext = fileName.split(".").pop()?.toLowerCase();
        let fileTypeLabel = ALLOWED_TYPES[mimeType];
        if (!fileTypeLabel && ext) {
            const extMap: Record<string, string> = {
                pdf: "PDF", epub: "EPUB", docx: "DOCX", txt: "TXT",
            };
            fileTypeLabel = extMap[ext];
        }

        if (!fileTypeLabel) {
            return NextResponse.json(
                { success: false, error: "Unsupported file type" },
                { status: 400 }
            );
        }

        // Generate storage key
        const key = `${payload.userId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

        // Get signed upload URL from Supabase
        const signRes = await fetch(
            `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${key}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            }
        );

        if (!signRes.ok) {
            const errText = await signRes.text();
            console.error("Failed to get signed URL:", errText);
            return NextResponse.json(
                { success: false, error: "Failed to prepare upload" },
                { status: 500 }
            );
        }

        const signData = await signRes.json();
        const signedUrl = `${SUPABASE_URL}/storage/v1${signData.url}`;
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;

        // Create book record in DB
        // Try with new format-specific fields first, fall back to core fields if DB hasn't been migrated
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let book: any;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const createData: any = {
                title: title || fileName.replace(/\.[^.]+$/, ""),
                fileUrl: publicUrl,
                fileType: fileTypeLabel as "PDF" | "EPUB" | "DOCX" | "TXT",
                originalFormat: fileTypeLabel,
                totalPages: 0,
                totalWords: 0,
                status: "PROCESSING",
                userId: payload.userId,
                metadata: {
                    originalName: fileName,
                    fileSize,
                    uploadedAt: new Date().toISOString(),
                    storageKey: key,
                },
            };

            if (fileTypeLabel === "PDF") {
                createData.pdfFileUrl = publicUrl;
                createData.conversionStatus = "PENDING";
            } else if (fileTypeLabel === "EPUB") {
                createData.epubFileUrl = publicUrl;
                createData.conversionStatus = "NONE";
            }

            book = await prisma.book.create({ data: createData });
        } catch {
            // New fields not in DB yet — create with core fields only
            book = await prisma.book.create({
                data: {
                    title: title || fileName.replace(/\.[^.]+$/, ""),
                    fileUrl: publicUrl,
                    fileType: fileTypeLabel as "PDF" | "EPUB" | "DOCX" | "TXT",
                    totalPages: 0,
                    totalWords: 0,
                    status: "PROCESSING",
                    userId: payload.userId,
                    metadata: {
                        originalName: fileName,
                        fileSize,
                        uploadedAt: new Date().toISOString(),
                        storageKey: key,
                    },
                },
            });
        }

        return NextResponse.json({
            success: true,
            uploadUrl: signedUrl,
            bookId: book.id,
            storageKey: key,
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
        console.error("Upload init error:", error);
        return NextResponse.json(
            { success: false, error: "Upload initialization failed" },
            { status: 500 }
        );
    }
}
