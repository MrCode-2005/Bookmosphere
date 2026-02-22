import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// GET /api/preferences — Get user preferences
export async function GET(req: NextRequest) {
    try {
        const payload = requireAuth(req);

        let prefs = await prisma.userPreferences.findUnique({
            where: { userId: payload.userId },
        });

        if (!prefs) {
            prefs = await prisma.userPreferences.create({
                data: { userId: payload.userId },
            });
        }

        return NextResponse.json({ success: true, data: prefs });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}

// PUT /api/preferences — Update user preferences
export async function PUT(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const data = await req.json();

        const prefs = await prisma.userPreferences.upsert({
            where: { userId: payload.userId },
            update: data,
            create: { userId: payload.userId, ...data },
        });

        return NextResponse.json({ success: true, data: prefs });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
