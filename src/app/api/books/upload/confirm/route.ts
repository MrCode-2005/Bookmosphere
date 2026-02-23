import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { processBook } from "@/workers/bookProcessor";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Step 2: Client calls this after uploading file to confirm and start processing
export async function POST(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const { bookId, storageKey } = await req.json();

        if (!bookId || !storageKey) {
            return NextResponse.json(
                { success: false, error: "bookId and storageKey are required" },
                { status: 400 }
            );
        }

        // Verify the book belongs to this user
        const book = await prisma.book.findUnique({
            where: { id: bookId },
            select: { userId: true, status: true },
        });

        if (!book || book.userId !== payload.userId) {
            return NextResponse.json(
                { success: false, error: "Book not found" },
                { status: 404 }
            );
        }

        // Start processing
        processBook(bookId, storageKey).catch((err) => {
            console.error(`Failed to process book ${bookId}:`, err);
        });

        return NextResponse.json({
            success: true,
            message: "Book processing started",
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }
        console.error("Upload confirm error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to confirm upload" },
            { status: 500 }
        );
    }
}
