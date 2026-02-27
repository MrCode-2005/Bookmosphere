import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/books/migrate — Backfill existing books with dual-format fields.
 * Safe to run multiple times. Updates books that are missing originalFormat.
 * This allows existing uploads to work with the new Reader/Flip mode system
 * without needing to re-upload.
 */
export async function POST(req: NextRequest) {
    try {
        const payload = requireAuth(req);

        // Get all books for this user that haven't been migrated yet
        const books = await prisma.book.findMany({
            where: {
                userId: payload.userId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                originalFormat: null as any,
            },
        });

        let migratedCount = 0;

        for (const book of books) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updateData: any = {
                originalFormat: book.fileType,
            };

            if (book.fileType === "PDF") {
                updateData.pdfFileUrl = book.fileUrl;
                updateData.conversionStatus = "PENDING"; // Can queue conversion later
            } else if (book.fileType === "EPUB") {
                updateData.epubFileUrl = book.fileUrl;
                updateData.conversionStatus = "NONE";
            } else {
                updateData.conversionStatus = "NONE";
            }

            await prisma.book.update({
                where: { id: book.id },
                data: updateData,
            });

            migratedCount++;
        }

        return NextResponse.json({
            success: true,
            migrated: migratedCount,
            message: migratedCount > 0
                ? `Migrated ${migratedCount} book(s) to dual-format system`
                : "All books are already migrated",
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        console.error("Migration error:", error);
        return NextResponse.json({ error: "Migration failed" }, { status: 500 });
    }
}
