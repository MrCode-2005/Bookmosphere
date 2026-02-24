import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getSignedDownloadUrl } from "@/lib/s3";

// GET /api/books — List user's books
export async function GET(req: NextRequest) {
    try {
        const payload = requireAuth(req);

        const books = await prisma.book.findMany({
            where: { userId: payload.userId },
            include: {
                progress: {
                    where: { userId: payload.userId },
                    take: 1,
                },
            },
            orderBy: { updatedAt: "desc" },
        });

        const booksWithProgress = await Promise.all(
            books.map(async (book) => {
                // Generate signed URL for PDF files
                let signedUrl: string | null = null;
                if (book.fileType === "PDF") {
                    const s3Key = book.fileUrl.split(".amazonaws.com/")[1] || book.fileUrl;
                    signedUrl = await getSignedDownloadUrl(s3Key);
                }
                return {
                    ...book,
                    signedUrl,
                    progress: book.progress[0] || null,
                };
            })
        );

        return NextResponse.json({ success: true, data: booksWithProgress });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        console.error("Books fetch error:", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
