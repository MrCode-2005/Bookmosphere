import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { deleteFile } from "@/lib/s3";

// GET /api/admin/uploads — List all uploads (admin only)
export async function GET(req: NextRequest) {
    try {
        requireAdmin(req);

        const books = await prisma.book.findMany({
            include: {
                user: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
        });

        return NextResponse.json({ success: true, data: books });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "Unauthorized") return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
            if (error.message === "Forbidden") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/admin/uploads?id=xxx — Remove upload (admin only)
export async function DELETE(req: NextRequest) {
    try {
        requireAdmin(req);
        const { searchParams } = new URL(req.url);
        const bookId = searchParams.get("id");

        if (!bookId) {
            return NextResponse.json({ success: false, error: "Book ID is required" }, { status: 400 });
        }

        const book = await prisma.book.findUnique({ where: { id: bookId } });
        if (!book) {
            return NextResponse.json({ success: false, error: "Book not found" }, { status: 404 });
        }

        // Delete from S3
        const s3Key = book.fileUrl.split(".amazonaws.com/")[1];
        if (s3Key) {
            await deleteFile(s3Key);
        }

        // Delete from DB (cascades to pages, bookmarks, etc.)
        await prisma.book.delete({ where: { id: bookId } });

        return NextResponse.json({ success: true, message: "Upload removed" });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "Unauthorized") return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
            if (error.message === "Forbidden") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
