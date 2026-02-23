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

        // Save pages in batches to avoid overwhelming the DB
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
 * Parse PDF using unpdf (serverless-compatible, no browser APIs needed).
 * Extracts text from each page individually.
 */
async function parsePdf(buffer: Buffer): Promise<{ pageNumber: number; content: string }[]> {
    const { extractText, getDocumentProxy } = await import("unpdf");

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: false });
    const totalPages = result.totalPages;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textData = result.text as any;

    const pages: { pageNumber: number; content: string }[] = [];

    if (Array.isArray(textData)) {
        // textData is an array of strings, one per PDF page
        for (let i = 0; i < textData.length; i++) {
            const pageText = String(textData[i] || "").trim();
            if (pageText.length > 0) {
                pages.push({
                    pageNumber: i + 1,
                    content: pageText,
                });
            }
        }
    } else if (textData && String(textData).trim().length > 0) {
        // Fallback: textData is a single string — split into reading pages
        const readingPages = splitTextIntoPages(String(textData));
        pages.push(...readingPages);
    }

    // If no text was extracted (scanned PDF), create placeholder pages
    if (pages.length === 0 && totalPages > 0) {
        for (let i = 1; i <= totalPages; i++) {
            pages.push({
                pageNumber: i,
                content: `[Page ${i} — This page contains non-text content (images/scanned text)]`,
            });
        }
    }

    console.log(`📄 PDF parsed: ${totalPages} PDF pages → ${pages.length} text pages`);
    return pages;
}

/**
 * Split a long text into pages of ~2000 characters.
 */
function splitTextIntoPages(text: string): { pageNumber: number; content: string }[] {
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

    if (pages.length === 0) {
        pages.push({ pageNumber: 1, content: text || "(Empty file)" });
    }

    return pages;
}
