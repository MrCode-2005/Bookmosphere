import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/s3";

/**
 * Process a book: read file, extract pages/text, save to DB.
 * - PDF: Only counts pages (rendering happens client-side via pdfjs-dist)
 * - TXT: Extracts text and splits into reading pages
 */
export async function processBook(bookId: string, storageKey: string) {
    console.log(`📖 Processing book ${bookId}...`);

    try {
        const buffer = await readFile(storageKey);
        const book = await prisma.book.findUnique({ where: { id: bookId } });
        if (!book) throw new Error("Book not found");

        let totalPages = 0;
        let totalWords = 0;
        let pages: { pageNumber: number; content: string }[] = [];

        switch (book.fileType) {
            case "PDF": {
                // For PDFs, only count pages — rendering happens client-side
                const result = await countPdfPages(buffer);
                totalPages = result.totalPages;
                totalWords = result.estimatedWords;
                // No BookPage records created for PDFs
                break;
            }
            case "TXT":
                pages = parseTxt(buffer.toString("utf-8"));
                totalPages = pages.length;
                totalWords = pages.reduce(
                    (sum, p) => sum + p.content.split(/\s+/).filter(Boolean).length,
                    0
                );
                break;
            case "EPUB":
                pages = [{ pageNumber: 1, content: "[EPUB parsing not yet supported]" }];
                totalPages = 1;
                break;
            case "DOCX":
                pages = [{ pageNumber: 1, content: "[DOCX parsing not yet supported]" }];
                totalPages = 1;
                break;
        }

        // Ensure at least one page
        if (totalPages === 0) totalPages = 1;

        // Delete any existing pages first (in case of re-processing)
        await prisma.bookPage.deleteMany({ where: { bookId } });

        // Save text pages for non-PDF books
        if (pages.length > 0) {
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
        }

        // Update book status to READY
        await prisma.book.update({
            where: { id: bookId },
            data: {
                totalPages,
                totalWords,
                status: "READY",
            },
        });

        console.log(`✅ Book ${bookId} processed: ${totalPages} pages, ${totalWords} words`);
    } catch (error) {
        console.error(`❌ Book ${bookId} processing failed:`, error);

        await prisma.book.update({
            where: { id: bookId },
            data: { status: "FAILED" },
        });
    }
}

/**
 * Count PDF pages using unpdf (serverless-compatible).
 * Only counts — no text extraction needed.
 */
async function countPdfPages(buffer: Buffer): Promise<{ totalPages: number; estimatedWords: number }> {
    const { getDocumentProxy, extractText } = await import("unpdf");

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const totalPages = pdf.numPages;

    // Quick estimation of word count from extracted text
    let estimatedWords = 0;
    try {
        const result = await extractText(pdf, { mergePages: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = String((result.text as any) || "");
        estimatedWords = text.split(/\s+/).filter(Boolean).length;
    } catch {
        // If text extraction fails, estimate ~250 words per page
        estimatedWords = totalPages * 250;
    }

    console.log(`📄 PDF page count: ${totalPages} pages, ~${estimatedWords} words`);
    return { totalPages, estimatedWords };
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
