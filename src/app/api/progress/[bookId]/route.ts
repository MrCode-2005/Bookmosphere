import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth";

// GET /api/progress/[bookId] — get saved reading position
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    const { bookId } = await params;
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const progress = await prisma.readingProgress.findUnique({
        where: { userId_bookId: { userId: payload.userId, bookId } },
    });

    return NextResponse.json({ progress });
}

// PUT /api/progress/[bookId] — upsert reading position
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    const { bookId } = await params;
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const body = await req.json();
    const {
        currentPage,
        percentage,
        chapterIndex,
        paragraphIndex,
        readingMode,
        scrollOffset,
        wordIndex,
    } = body;

    // Build update data — only include provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    if (currentPage !== undefined) updateData.currentPage = currentPage;
    if (percentage !== undefined) updateData.percentage = percentage;
    if (chapterIndex !== undefined) updateData.chapterIndex = chapterIndex;
    if (paragraphIndex !== undefined) updateData.paragraphIndex = paragraphIndex;
    if (readingMode !== undefined) updateData.readingMode = readingMode;
    if (scrollOffset !== undefined) updateData.scrollOffset = scrollOffset;
    if (wordIndex !== undefined) updateData.wordIndex = wordIndex;

    // Try with new fields first, fall back to core fields if DB hasn't been migrated
    let progress;
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress = await (prisma.readingProgress as any).upsert({
            where: { userId_bookId: { userId: payload.userId, bookId } },
            update: updateData,
            create: {
                userId: payload.userId,
                bookId,
                currentPage: currentPage || 0,
                percentage: percentage || 0,
                chapterIndex: chapterIndex || 0,
                paragraphIndex: paragraphIndex || 0,
                readingMode: readingMode || "reader",
                scrollOffset: scrollOffset || 0,
                wordIndex: wordIndex || 0,
            },
        });
    } catch {
        // New fields not in DB yet — fall back to core fields only
        const coreData: Record<string, number> = {};
        if (currentPage !== undefined) coreData.currentPage = currentPage;
        if (percentage !== undefined) coreData.percentage = percentage;

        progress = await prisma.readingProgress.upsert({
            where: { userId_bookId: { userId: payload.userId, bookId } },
            update: coreData,
            create: {
                userId: payload.userId,
                bookId,
                currentPage: currentPage || 0,
                percentage: percentage || 0,
            },
        });
    }

    return NextResponse.json({ progress });
}
