import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth";

// GET /api/bookmarks/[bookId] — list bookmarks for a book
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    const { bookId } = await params;
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const bookmarks = await prisma.bookmark.findMany({
        where: { userId: payload.userId, bookId },
        orderBy: { pageNumber: "asc" },
    });

    return NextResponse.json({ bookmarks });
}

// POST /api/bookmarks/[bookId] — create a bookmark
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    const { bookId } = await params;
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const body = await req.json();
    const { pageNumber, note, color } = body;

    const bookmark = await prisma.bookmark.create({
        data: {
            userId: payload.userId,
            bookId,
            pageNumber,
            note: note || null,
            color: color || "#FFD700",
        },
    });

    return NextResponse.json({ bookmark }, { status: 201 });
}

// DELETE /api/bookmarks/[bookId] — delete a bookmark by id (passed in body)
export async function DELETE(req: NextRequest) {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const body = await req.json();
    const { bookmarkId } = body;

    // Verify ownership
    const bookmark = await prisma.bookmark.findUnique({ where: { id: bookmarkId } });
    if (!bookmark || bookmark.userId !== payload.userId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.bookmark.delete({ where: { id: bookmarkId } });

    return NextResponse.json({ deleted: true });
}
