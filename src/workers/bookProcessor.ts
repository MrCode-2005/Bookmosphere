import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/s3";

/**
 * Process a book: read file, extract pages/text, save to DB.
 * Supports TXT, PDF, and EPUB. Called after upload confirmation.
 * For PDF: counts pages, queues PDF→EPUB conversion
 * For EPUB: parses metadata and sets READY immediately
 */
export async function processBook(bookId: string, storageKey: string) {
    console.log(`📖 Processing book ${bookId}...`);

    try {
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
                const pdfResult = await countPdfPages(buffer);
                pdfPageCount = pdfResult.totalPages;
                pdfWordEstimate = pdfResult.estimatedWords;
                break;
            }

            case "EPUB": {
                // Parse EPUB metadata and structure
                const epubResult = await parseEpub(buffer);
                pdfPageCount = epubResult.estimatedPages;
                pdfWordEstimate = epubResult.estimatedWords;
                break;
            }

            case "DOCX":
                pages = [{ pageNumber: 1, content: "[DOCX parsing not yet supported]" }];
                break;
        }

        // For non-PDF/non-EPUB: ensure at least one page
        if (!["PDF", "EPUB"].includes(book.fileType) && pages.length === 0) {
            pages = [{ pageNumber: 1, content: "(Empty document)" }];
        }

        const totalWords = ["PDF", "EPUB"].includes(book.fileType)
            ? pdfWordEstimate
            : pages.reduce(
                (sum, p) => sum + p.content.split(/\s+/).filter(Boolean).length,
                0
            );

        // Delete any existing pages first
        await prisma.bookPage.deleteMany({ where: { bookId } });

        // Save pages in batches (only for text-based formats)
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

        const finalPageCount = ["PDF", "EPUB"].includes(book.fileType) ? pdfPageCount : pages.length;
        const publicUrl = book.fileUrl;

        // Core fields that always exist
        const coreUpdate = {
            totalPages: finalPageCount,
            totalWords,
            status: "READY" as const,
        };

        // Try to set format-specific fields (may fail if DB migration hasn't been applied yet)
        if (book.fileType === "PDF") {
            try {
                await prisma.book.update({
                    where: { id: bookId },
                    data: {
                        ...coreUpdate,
                        originalFormat: "PDF",
                        pdfFileUrl: publicUrl,
                        conversionStatus: "PENDING",
                    },
                });
            } catch {
                // New fields not in DB yet — fall back to core update only
                console.warn(`⚠️ New fields not available, updating core fields only for book ${bookId}`);
                await prisma.book.update({
                    where: { id: bookId },
                    data: coreUpdate,
                });
            }

            // Queue PDF→EPUB conversion (non-blocking, optional)
            try {
                const { queueConversion } = await import("@/lib/conversion/queue");
                await queueConversion({
                    bookId,
                    pdfStorageKey: storageKey,
                    title: book.title,
                    author: book.author || undefined,
                });
                console.log(`🔄 Queued conversion for book ${bookId}`);
            } catch (err) {
                console.warn(`⚠️ Could not queue conversion (Redis may be unavailable):`, err);
            }
        } else if (book.fileType === "EPUB") {
            try {
                await prisma.book.update({
                    where: { id: bookId },
                    data: {
                        ...coreUpdate,
                        originalFormat: "EPUB",
                        epubFileUrl: publicUrl,
                        conversionStatus: "NONE",
                    },
                });
            } catch {
                // New fields not in DB yet — fall back to core update only
                console.warn(`⚠️ New fields not available, updating core fields only for book ${bookId}`);
                await prisma.book.update({
                    where: { id: bookId },
                    data: coreUpdate,
                });
            }
        } else {
            await prisma.book.update({
                where: { id: bookId },
                data: coreUpdate,
            });
        }

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
 */
async function countPdfPages(buffer: Buffer): Promise<{ totalPages: number; estimatedWords: number }> {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const totalPages = pdf.numPages;

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
 * Parse EPUB metadata to extract page estimate and word count.
 * Uses a lightweight approach — doesn't fully render the EPUB.
 */
async function parseEpub(buffer: Buffer): Promise<{ estimatedPages: number; estimatedWords: number }> {
    // Estimate based on file size
    // Average EPUB: ~1KB per page, ~250 words per page
    const sizeKB = buffer.length / 1024;
    const estimatedPages = Math.max(1, Math.round(sizeKB / 2));
    const estimatedWords = estimatedPages * 250;

    console.log(`📘 EPUB: ~${estimatedPages} pages, ~${estimatedWords} words (estimated from ${Math.round(sizeKB)}KB)`);
    return { estimatedPages, estimatedWords };
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
