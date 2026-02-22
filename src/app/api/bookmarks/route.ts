import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// GET /api/bookmarks?bookId=xxx — List bookmarks for a book
export async function GET(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const { searchParams } = new URL(req.url);
        const bookId = searchParams.get("bookId");

        if (!bookId) {
            return NextResponse.json({ success: false, error: "bookId is required" }, { status: 400 });
        }

        const bookmarks = await prisma.bookmark.findMany({
            where: { userId: payload.userId, bookId },
            orderBy: { pageNumber: "asc" },
        });

        return NextResponse.json({ success: true, data: bookmarks });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}

// POST /api/bookmarks — Create a bookmark
export async function POST(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const { bookId, pageNumber, wordIndex, note, color } = await req.json();

        const bookmark = await prisma.bookmark.create({
            data: {
                userId: payload.userId,
                bookId,
                pageNumber,
                wordIndex,
                note,
                color: color || "#FFD700",
            },
        });

        return NextResponse.json({ success: true, data: bookmark }, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/bookmarks?id=xxx — Delete a bookmark
export async function DELETE(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ success: false, error: "Bookmark ID is required" }, { status: 400 });
        }

        // Verify ownership
        const bookmark = await prisma.bookmark.findFirst({
            where: { id, userId: payload.userId },
        });

        if (!bookmark) {
            return NextResponse.json({ success: false, error: "Bookmark not found" }, { status: 404 });
        }

        await prisma.bookmark.delete({ where: { id } });

        return NextResponse.json({ success: true, message: "Bookmark deleted" });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
