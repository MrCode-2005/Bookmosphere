import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/users — List all users (admin only)
export async function GET(req: NextRequest) {
    try {
        requireAdmin(req);

        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                avatarUrl: true,
                createdAt: true,
                _count: { select: { books: true, sessions: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ success: true, data: users });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "Unauthorized") {
                return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
            }
            if (error.message === "Forbidden") {
                return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
            }
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
