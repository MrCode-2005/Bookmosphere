import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/s3";

/**
 * Process a book: read file, extract pages/text, save to DB.
 * Supports TXT and PDF. Called after upload confirmation.
 */
export async function processBook(bookId: string, storageKey: string) {
    console.log(`📖 Processing book ${bookId}...`);

    try {
        // Read the file from storage
        const buffer = await readFile(storageKey);
        const book = await prisma.book.findUnique({ where: { id: bookId } });
        if (!book) throw new Error("Book not found");

        let pages: { pageNumber: number; content: string }[] = [];

        switch (book.fileType) {
            case "TXT":
                pages = parseTxt(buffer.toString("utf-8"));
                break;
            case "PDF":
                pages = await parsePdf(buffer);
                break;
            case "EPUB":
                pages = [{ pageNumber: 1, content: "[EPUB parsing not yet supported]" }];
                break;
            case "DOCX":
                pages = [{ pageNumber: 1, content: "[DOCX parsing not yet supported]" }];
                break;
        }

        // Ensure at least one page
        if (pages.length === 0) {
            pages = [{ pageNumber: 1, content: "(Empty document)" }];
        }

        // Calculate total words
        const totalWords = pages.reduce(
            (sum, p) => sum + p.content.split(/\s+/).filter(Boolean).length,
            0
        );

        // Delete any existing pages first (in case of re-processing)
        await prisma.bookPage.deleteMany({ where: { bookId } });

        // Save pages and update book status in a transaction
        // Process in batches to avoid overwhelming the DB
        const BATCH_SIZE = 50;
        for (let i = 0; i < pages.length; i += BATCH_SIZE) {
            const batch = pages.slice(i, i + BATCH_SIZE);
            await prisma.$transaction(
                batch.map((page) =>
                    prisma.bookPage.create({
                        data: {
                            bookId,
                            pageNumber: page.pageNumber,
                            content: page.content,
                            wordCount: page.content.split(/\s+/).filter(Boolean).length,
                        },
                    })
                )
            );
        }

        // Update book status to READY
        await prisma.book.update({
            where: { id: bookId },
            data: {
                totalPages: pages.length,
                totalWords,
                status: "READY",
            },
        });

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
 * Parse PDF using pdf-parse (Node.js compatible, no browser APIs needed).
 * Splits the extracted text into pages of ~2000 characters.
 */
async function parsePdf(buffer: Buffer): Promise<{ pageNumber: number; content: string }[]> {
    // pdf-parse works in Node.js without DOMMatrix or canvas
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");

    const data = await pdfParse(buffer);

    if (!data.text || data.text.trim().length === 0) {
        // Scanned PDF or no extractable text
        const numPages = data.numpages || 1;
        const pages: { pageNumber: number; content: string }[] = [];
        for (let i = 1; i <= numPages; i++) {
            pages.push({
                pageNumber: i,
                content: `[Page ${i} — This page contains non-text content (images/scanned text)]`,
            });
        }
        return pages;
    }

    // Split extracted text into pages of ~2000 chars each
    const CHARS_PER_PAGE = 2000;
    const pages: { pageNumber: number; content: string }[] = [];
    const fullText = data.text;

    // Try to split on paragraph boundaries
    const paragraphs = fullText.split(/\n\n+/);
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

    // Fallback: if no pages were created, use the raw text
    if (pages.length === 0) {
        // Split by character count
        for (let i = 0; i < fullText.length; i += CHARS_PER_PAGE) {
            pages.push({
                pageNumber: pages.length + 1,
                content: fullText.slice(i, i + CHARS_PER_PAGE).trim(),
            });
        }
    }

    // Final fallback
    if (pages.length === 0) {
        pages.push({ pageNumber: 1, content: fullText || "(Empty PDF)" });
    }

    console.log(`📄 PDF parsed: ${data.numpages} PDF pages → ${pages.length} reading pages, ${fullText.length} chars`);
    return pages;
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
