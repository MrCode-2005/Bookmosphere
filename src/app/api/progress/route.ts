import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// POST /api/progress — Save reading progress
export async function POST(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const { bookId, currentPage, wordIndex, scrollOffset, percentage } = await req.json();

        if (!bookId) {
            return NextResponse.json({ success: false, error: "bookId is required" }, { status: 400 });
        }

        const progress = await prisma.readingProgress.upsert({
            where: {
                userId_bookId: { userId: payload.userId, bookId },
            },
            update: {
                currentPage: currentPage || 0,
                wordIndex: wordIndex || 0,
                scrollOffset: scrollOffset || 0,
                percentage: percentage || 0,
            },
            create: {
                userId: payload.userId,
                bookId,
                currentPage: currentPage || 0,
                wordIndex: wordIndex || 0,
                scrollOffset: scrollOffset || 0,
                percentage: percentage || 0,
            },
        });

        return NextResponse.json({ success: true, data: progress });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}

// GET /api/progress?bookId=xxx — Get reading progress
export async function GET(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const { searchParams } = new URL(req.url);
        const bookId = searchParams.get("bookId");

        if (!bookId) {
            return NextResponse.json({ success: false, error: "bookId is required" }, { status: 400 });
        }

        const progress = await prisma.readingProgress.findUnique({
            where: {
                userId_bookId: { userId: payload.userId, bookId },
            },
        });

        return NextResponse.json({ success: true, data: progress });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
