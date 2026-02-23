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
                // EPUB support can be added later
                pages = [{ pageNumber: 1, content: "[EPUB parsing not yet supported]" }];
                break;
            case "DOCX":
                // DOCX support can be added later  
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
            // Update book status to READY
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
 * Parse PDF using pdfjs-dist — extract text from each page.
 */
async function parsePdf(buffer: Buffer): Promise<{ pageNumber: number; content: string }[]> {
    // Dynamic import to avoid SSR issues
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Load the PDF document from the buffer
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
        data,
        useSystemFonts: true,
        // Disable worker to run in serverless environment
    });
    const pdf = await loadingTask.promise;

    const pages: { pageNumber: number; content: string }[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Extract text items and join them
            const text = textContent.items
                .filter((item) => "str" in item && typeof (item as { str: string }).str === "string")
                .map((item) => (item as { str: string }).str)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();

            if (text.length > 0) {
                pages.push({
                    pageNumber: i,
                    content: text,
                });
            }
        } catch (pageError) {
            console.warn(`Warning: Could not extract text from page ${i}:`, pageError);
            // Skip pages that fail to parse
        }
    }

    // If no text was extracted (scanned PDF), create placeholder pages
    if (pages.length === 0 && pdf.numPages > 0) {
        for (let i = 1; i <= pdf.numPages; i++) {
            pages.push({
                pageNumber: i,
                content: `[Page ${i} — This page contains non-text content (images/scanned text)]`,
            });
        }
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

    // Ensure at least one page
    if (pages.length === 0) {
        pages.push({ pageNumber: 1, content: text || "(Empty file)" });
    }

    return pages;
}
