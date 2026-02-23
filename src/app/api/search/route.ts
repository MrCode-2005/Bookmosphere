import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// GET /api/search?q=query&source=library|google|openlibrary
export async function GET(req: NextRequest) {
    try {
        const payload = requireAuth(req);
        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q");
        const source = searchParams.get("source") || "library";

        if (!query) {
            return NextResponse.json({ success: false, error: "Search query is required" }, { status: 400 });
        }

        const results = [];

        if (source === "library" || source === "all") {
            // Internal library search
            const books = await prisma.book.findMany({
                where: {
                    userId: payload.userId,
                    status: "READY",
                    OR: [
                        { title: { contains: query, mode: "insensitive" } },
                        { author: { contains: query, mode: "insensitive" } },
                    ],
                },
                take: 20,
            });

            results.push(
                ...books.map((b) => ({
                    source: "library" as const,
                    id: b.id,
                    title: b.title,
                    author: b.author || undefined,
                    coverUrl: b.coverUrl || undefined,
                }))
            );
        }

        if (source === "google" || source === "all") {
            // Google Books API
            const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
            if (apiKey) {
                try {
                    const gRes = await fetch(
                        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10&key=${apiKey}`
                    );
                    if (gRes.ok) {
                        const gData = await gRes.json();
                        results.push(
                            ...(gData.items || []).map((item: { id: string; volumeInfo: { title?: string; authors?: string[]; imageLinks?: { thumbnail?: string }; description?: string; publishedDate?: string; previewLink?: string } }) => ({
                                source: "google" as const,
                                id: item.id,
                                title: item.volumeInfo?.title || "Untitled",
                                author: item.volumeInfo?.authors?.join(", "),
                                coverUrl: item.volumeInfo?.imageLinks?.thumbnail,
                                description: item.volumeInfo?.description,
                                publishedDate: item.volumeInfo?.publishedDate,
                                externalUrl: item.volumeInfo?.previewLink || `https://books.google.com/books?id=${item.id}`,
                            }))
                        );
                    }
                } catch {
                    // Silently fail external API
                }
            }
        }

        if (source === "openlibrary" || source === "all") {
            // OpenLibrary API
            try {
                const olRes = await fetch(
                    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`
                );
                if (olRes.ok) {
                    const olData = await olRes.json();
                    results.push(
                        ...(olData.docs || []).map((doc: { key?: string; title?: string; author_name?: string[]; cover_i?: number; first_publish_year?: number }) => ({
                            source: "openlibrary" as const,
                            id: doc.key || "",
                            title: doc.title || "Untitled",
                            author: doc.author_name?.join(", "),
                            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
                            publishedDate: doc.first_publish_year?.toString(),
                            externalUrl: doc.key ? `https://openlibrary.org${doc.key}` : undefined,
                        }))
                    );
                }
            } catch {
                // Silently fail external API
            }
        }

        return NextResponse.json({ success: true, data: results });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
