import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { queueConversion } from "@/lib/conversion/queue";

// GET /api/books/[bookId]/convert — check conversion status
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    try {
        const payload = requireAuth(req);
        const { bookId } = await params;

        const book = await prisma.book.findFirst({
            where: { id: bookId, userId: payload.userId },
            select: {
                id: true,
                conversionStatus: true,
                conversionError: true,
                epubFileUrl: true,
                pdfFileUrl: true,
                originalFormat: true,
            },
        });

        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 });
        }

        return NextResponse.json({ conversion: book });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST /api/books/[bookId]/convert — retry conversion
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    try {
        const payload = requireAuth(req);
        const { bookId } = await params;

        const book = await prisma.book.findFirst({
            where: { id: bookId, userId: payload.userId },
        });

        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 });
        }

        if (book.originalFormat !== "PDF") {
            return NextResponse.json(
                { error: "Only PDF books can be converted" },
                { status: 400 }
            );
        }

        if (book.conversionStatus === "PROCESSING") {
            return NextResponse.json(
                { error: "Conversion already in progress" },
                { status: 409 }
            );
        }

        // Get storage key from metadata
        const metadata = book.metadata as { storageKey?: string } | null;
        const storageKey = metadata?.storageKey || "";

        // Queue conversion
        await prisma.book.update({
            where: { id: bookId },
            data: { conversionStatus: "PENDING", conversionError: null },
        });

        await queueConversion({
            bookId,
            pdfStorageKey: storageKey,
            title: book.title,
            author: book.author || undefined,
        });

        return NextResponse.json({ success: true, status: "PENDING" });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        console.error("Conversion retry error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
