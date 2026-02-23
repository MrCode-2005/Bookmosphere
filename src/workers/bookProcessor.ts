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
        let pdfPageCount = 0;
        let pdfWordEstimate = 0;

        switch (book.fileType) {
            case "TXT":
                pages = parseTxt(buffer.toString("utf-8"));
                break;
            case "PDF": {
                // For PDFs: only count pages. Rendering happens client-side via pdfjs-dist.
                const pdfResult = await countPdfPages(buffer);
                pdfPageCount = pdfResult.totalPages;
                pdfWordEstimate = pdfResult.estimatedWords;
                break;
            }
            case "EPUB":
                pages = [{ pageNumber: 1, content: "[EPUB parsing not yet supported]" }];
                break;
            case "DOCX":
                pages = [{ pageNumber: 1, content: "[DOCX parsing not yet supported]" }];
                break;
        }

        // For non-PDF: ensure at least one page
        if (book.fileType !== "PDF" && pages.length === 0) {
            pages = [{ pageNumber: 1, content: "(Empty document)" }];
        }

        // Calculate total words
        const totalWords = book.fileType === "PDF"
            ? pdfWordEstimate
            : pages.reduce(
                (sum, p) => sum + p.content.split(/\s+/).filter(Boolean).length,
                0
            );

        // Delete any existing pages first (in case of re-processing)
        await prisma.bookPage.deleteMany({ where: { bookId } });

        // Save pages in batches (only for non-PDF — PDFs render client-side)
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

        const finalPageCount = book.fileType === "PDF" ? pdfPageCount : pages.length;

        // Update book status to READY
        await prisma.book.update({
            where: { id: bookId },
            data: {
                totalPages: finalPageCount,
                totalWords,
                status: "READY",
            },
        });

        console.log(`✅ Book ${bookId} processed: ${finalPageCount} pages, ${totalWords} words`);
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
 * Only counts — no text extraction stored. Rendering is client-side.
 */
async function countPdfPages(buffer: Buffer): Promise<{ totalPages: number; estimatedWords: number }> {
    const { getDocumentProxy, extractText } = await import("unpdf");

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const totalPages = pdf.numPages;

    // Quick word-count estimate
    let estimatedWords = 0;
    try {
        const result = await extractText(pdf, { mergePages: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = String((result.text as any) || "");
        estimatedWords = text.split(/\s+/).filter(Boolean).length;
    } catch {
        estimatedWords = totalPages * 250;
    }

    console.log(`📄 PDF: ${totalPages} pages, ~${estimatedWords} words`);
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
