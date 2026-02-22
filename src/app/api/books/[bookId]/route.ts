import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getSignedDownloadUrl } from "@/lib/s3";

// GET /api/books/[bookId] — Get single book details
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    try {
        const payload = requireAuth(req);
        const { bookId } = await params;

        const book = await prisma.book.findFirst({
            where: { id: bookId, userId: payload.userId },
            include: {
                pages: {
                    orderBy: { pageNumber: "asc" },
                    select: { pageNumber: true, content: true, wordCount: true },
                },
                progress: {
                    where: { userId: payload.userId },
                    take: 1,
                },
                bookmarks: {
                    where: { userId: payload.userId },
                    orderBy: { pageNumber: "asc" },
                },
            },
        });

        if (!book) {
            return NextResponse.json({ success: false, error: "Book not found" }, { status: 404 });
        }

        // Generate signed URL for the file
        const s3Key = book.fileUrl.split(".amazonaws.com/")[1];
        let signedUrl = book.fileUrl;
        if (s3Key) {
            signedUrl = await getSignedDownloadUrl(s3Key);
        }

        return NextResponse.json({
            success: true,
            data: {
                ...book,
                signedUrl,
                progress: book.progress[0] || null,
            },
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        console.error("Book fetch error:", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/books/[bookId] — Delete a book
export async function DELETE(
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
            return NextResponse.json({ success: false, error: "Book not found" }, { status: 404 });
        }

        await prisma.book.delete({ where: { id: bookId } });

        return NextResponse.json({ success: true, message: "Book deleted" });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        console.error("Book delete error:", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
