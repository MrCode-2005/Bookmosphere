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
        });

        const booksWithProgress = await Promise.all(
            books.map(async (book) => {
                // Generate signed URL for PDF files
                let signedUrl: string | null = null;
                if (book.fileType === "PDF") {
                    const s3Key = book.fileUrl.split(".amazonaws.com/")[1];
                    if (s3Key) {
                        signedUrl = await getSignedDownloadUrl(s3Key);
                    } else {
                        // fileUrl is already a full Supabase/public URL
                        signedUrl = book.fileUrl;
                    }
                }
                const prog = book.progress[0] || null;
                return {
                    ...book,
                    signedUrl,
                    progress: prog,
                };
            })
        );

        // Sort: books with recent progress first (by progress.updatedAt desc),
        // then books without progress by createdAt desc
        booksWithProgress.sort((a, b) => {
            const aTime = a.progress?.updatedAt ? new Date(a.progress.updatedAt).getTime() : 0;
            const bTime = b.progress?.updatedAt ? new Date(b.progress.updatedAt).getTime() : 0;
            if (aTime && bTime) return bTime - aTime; // Both have progress: most recent first
            if (aTime && !bTime) return -1; // a has progress, b doesn't
            if (!aTime && bTime) return 1;  // b has progress, a doesn't
            // Neither has progress: sort by createdAt desc
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return NextResponse.json({ success: true, data: booksWithProgress });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        console.error("Books fetch error:", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
