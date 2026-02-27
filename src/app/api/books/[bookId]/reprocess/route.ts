import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { processBook } from "@/workers/bookProcessor";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/books/[bookId]/reprocess — Re-process a book.
 * Useful for EPUB books that were processed before the improved parser was available,
 * or for any book that needs to be re-analyzed (fix page count, extract metadata, etc.).
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    try {
        const payload = requireAuth(req);
        const { bookId } = await params;

        // Find the book
        const book = await prisma.book.findFirst({
            where: { id: bookId, userId: payload.userId },
        });

        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 });
        }

        // Extract storage key from metadata or fileUrl
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metadata = book.metadata as any;
        const storageKey = metadata?.storageKey;

        if (!storageKey) {
            return NextResponse.json({ error: "Storage key not found" }, { status: 400 });
        }

        // Set status to PROCESSING
        await prisma.book.update({
            where: { id: bookId },
            data: { status: "PROCESSING" },
        });

        // Delete old dummy pages (like "[EPUB parsing not yet supported]")
        await prisma.bookPage.deleteMany({ where: { bookId } });

        // Re-process the book with the improved parser
        await processBook(bookId, storageKey);

        // Fetch updated book
        const updated = await prisma.book.findUnique({
            where: { id: bookId },
            select: { status: true, totalPages: true, totalWords: true, fileType: true },
        });

        return NextResponse.json({
            success: true,
            message: "Book re-processed successfully",
            book: updated,
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        console.error("Reprocess error:", error);
        return NextResponse.json({ error: "Re-processing failed" }, { status: 500 });
    }
}
