import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/s3";

/**
 * Process a book: read file, extract pages/text, save to DB.
 * Currently handles TXT and provides a stub for other formats.
 * Called asynchronously after upload.
 */
export async function processBook(bookId: string, storageKey: string) {
    console.log(`📖 Processing book ${bookId}...`);

    try {
        // Read the file
        const buffer = await readFile(storageKey);
        const book = await prisma.book.findUnique({ where: { id: bookId } });
        if (!book) throw new Error("Book not found");

        let pages: { pageNumber: number; content: string }[] = [];

        switch (book.fileType) {
            case "TXT":
                pages = parseTxt(buffer.toString("utf-8"));
                break;
            case "PDF":
                // PDF parsing requires heavy libraries — stub for now
                pages = [{ pageNumber: 1, content: "[PDF content — full parser coming in Phase 4]" }];
                break;
            case "EPUB":
                pages = [{ pageNumber: 1, content: "[EPUB content — full parser coming in Phase 4]" }];
                break;
            case "DOCX":
                pages = [{ pageNumber: 1, content: "[DOCX content — full parser coming in Phase 4]" }];
                break;
        }

        // Calculate total words
        const totalWords = pages.reduce(
            (sum, p) => sum + p.content.split(/\s+/).filter(Boolean).length,
            0
        );

        // Save pages and update book
        await prisma.$transaction([
            // Create BookPage records
            ...pages.map((page) =>
                prisma.bookPage.create({
                    data: {
                        bookId,
                        pageNumber: page.pageNumber,
                        content: page.content,
                        wordCount: page.content.split(/\s+/).filter(Boolean).length,
                    },
                })
            ),
            // Update book status
            prisma.book.update({
                where: { id: bookId },
                data: {
                    totalPages: pages.length,
                    totalWords,
                    status: "READY",
                },
            }),
        ]);

        console.log(`✅ Book ${bookId} processed: ${pages.length} pages, ${totalWords} words`);
    } catch (error) {
        console.error(`❌ Book ${bookId} processing failed:`, error);

        await prisma.book.update({
            where: { id: bookId },
            data: { status: "FAILED" },
        });
    }
}

/**
 * Parse plain text into pages (~2000 chars per page).
 */
function parseTxt(text: string): { pageNumber: number; content: string }[] {
    const CHARS_PER_PAGE = 2000;
    const pages: { pageNumber: number; content: string }[] = [];
    const paragraphs = text.split(/\n\n+/);
    let currentPage = "";
    let pageNum = 1;

    for (const para of paragraphs) {
        if (currentPage.length + para.length > CHARS_PER_PAGE && currentPage.length > 0) {
            pages.push({ pageNumber: pageNum++, content: currentPage.trim() });
            currentPage = "";
        }
        currentPage += para + "\n\n";
    }

    if (currentPage.trim()) {
        pages.push({ pageNumber: pageNum, content: currentPage.trim() });
    }

    // Ensure at least one page
    if (pages.length === 0) {
        pages.push({ pageNumber: 1, content: text || "(Empty file)" });
    }

    return pages;
}
