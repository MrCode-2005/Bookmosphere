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

        // Generate signed URL for the primary file
        const s3Key = book.fileUrl.split(".amazonaws.com/")[1];
        let signedUrl = book.fileUrl;
        if (s3Key) {
            signedUrl = await getSignedDownloadUrl(s3Key);
        }

        // Also generate signed URL for the EPUB file if it's stored separately
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bookData = book as any;
        let epubSignedUrl = bookData.epubFileUrl || undefined;
        let pdfSignedUrl = bookData.pdfFileUrl || undefined;

        // If this is a PDF book, the signedUrl IS the PDF URL
        if (book.fileType === "PDF") {
            pdfSignedUrl = signedUrl;
        }
        // If this is an EPUB book, the signedUrl IS the EPUB URL
        if (book.fileType === "EPUB") {
            epubSignedUrl = signedUrl;
        }

        return NextResponse.json({
            success: true,
            data: {
                ...book,
                signedUrl,
                pdfFileUrl: pdfSignedUrl,
                epubFileUrl: epubSignedUrl,
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
