import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

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

        const booksWithProgress = books.map((book) => ({
            ...book,
            progress: book.progress[0] || null,
        }));

        return NextResponse.json({ success: true, data: booksWithProgress });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        console.error("Books fetch error:", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
