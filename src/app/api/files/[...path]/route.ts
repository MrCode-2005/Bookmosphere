import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "uploads");

// Serve local files in development
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path: segments } = await params;
        const filePath = path.join(LOCAL_UPLOAD_DIR, ...segments);

        // Security: prevent path traversal
        if (!filePath.startsWith(LOCAL_UPLOAD_DIR)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const data = await fs.readFile(filePath);

        // Determine content type
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: Record<string, string> = {
            ".pdf": "application/pdf",
            ".epub": "application/epub+zip",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt": "text/plain",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
        };

        return new NextResponse(data, {
            headers: {
                "Content-Type": contentTypes[ext] || "application/octet-stream",
                "Content-Length": data.length.toString(),
            },
        });
    } catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}
