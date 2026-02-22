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
    const { currentPage, percentage } = body;

    const progress = await prisma.readingProgress.upsert({
        where: { userId_bookId: { userId: payload.userId, bookId } },
        update: { currentPage, percentage },
        create: {
            userId: payload.userId,
            bookId,
            currentPage,
            percentage,
        },
    });

    return NextResponse.json({ progress });
}
