import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/s3";

// Polyfill browser globals that pdf-parse/pdfjs-dist needs in Node.js
if (typeof globalThis.DOMMatrix === "undefined") {
    // Minimal DOMMatrix polyfill for pdfjs text extraction
    class DOMMatrixPolyfill {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        is2D = true;
        isIdentity = true;

        constructor(init?: string | number[]) {
            if (Array.isArray(init) && init.length >= 6) {
                this.a = this.m11 = init[0];
                this.b = this.m12 = init[1];
                this.c = this.m21 = init[2];
                this.d = this.m22 = init[3];
                this.e = this.m41 = init[4];
                this.f = this.m42 = init[5];
                this.isIdentity = false;
            }
        }

        transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
        translate() { return new DOMMatrixPolyfill(); }
        scale() { return new DOMMatrixPolyfill(); }
        rotate() { return new DOMMatrixPolyfill(); }
        multiply() { return new DOMMatrixPolyfill(); }
        inverse() { return new DOMMatrixPolyfill(); }
        toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}

// Polyfill ImageData if missing
if (typeof globalThis.ImageData === "undefined") {
    class ImageDataPolyfill {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(w: number, h: number) {
            this.width = w;
            this.height = h;
            this.data = new Uint8ClampedArray(w * h * 4);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ImageData = ImageDataPolyfill;
}

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
 * Parse PDF using pdf-parse (with polyfills for Node.js serverless).
 * Extracts all text and splits into reading-size pages.
 */
async function parsePdf(buffer: Buffer): Promise<{ pageNumber: number; content: string }[]> {
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

    // Fallback: split by character count
    if (pages.length === 0) {
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

    if (pages.length === 0) {
        pages.push({ pageNumber: 1, content: text || "(Empty file)" });
    }

    return pages;
}
