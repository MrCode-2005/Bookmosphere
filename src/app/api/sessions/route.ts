import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth";

// POST /api/sessions — create or update a reading session
export async function POST(req: NextRequest) {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const body = await req.json();
    const { bookId, sessionId, pagesRead, wordsRead, duration, endSession } = body;

    if (sessionId) {
        // Update existing session
        const session = await prisma.readingSession.update({
            where: { id: sessionId },
            data: {
                pagesRead,
                wordsRead,
                duration,
                ...(endSession ? { endedAt: new Date() } : {}),
            },
        });
        return NextResponse.json({ session });
    }

    // Create new session
    const session = await prisma.readingSession.create({
        data: {
            userId: payload.userId,
            bookId,
            pagesRead: pagesRead || 0,
            wordsRead: wordsRead || 0,
            duration: duration || 0,
        },
    });

    return NextResponse.json({ session }, { status: 201 });
}

// GET /api/sessions?bookId=xxx — get reading sessions
export async function GET(req: NextRequest) {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const bookId = req.nextUrl.searchParams.get("bookId");

    const sessions = await prisma.readingSession.findMany({
        where: {
            userId: payload.userId,
            ...(bookId ? { bookId } : {}),
        },
        orderBy: { startedAt: "desc" },
        take: 50,
    });

    return NextResponse.json({ sessions });
}
