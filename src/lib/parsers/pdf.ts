import type { ParsedBookData, ParsedPage } from "@/types";

/**
 * Parse a PDF file buffer into structured book data.
 * Uses pdfjs-dist for server-side extraction.
 */
export async function parsePDF(buffer: Buffer): Promise<ParsedBookData> {
    // Dynamic import for server-side use
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const data = new Uint8Array(buffer);
    const doc = await pdfjsLib.getDocument({ data }).promise;

    const pages: ParsedPage[] = [];
    let totalWords = 0;

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const content = textContent.items
            .filter((item): item is typeof item & { str: string } => "str" in item)
            .map((item) => item.str || "")
            .join(" ");

        const wordCount = content.split(/\s+/).filter(Boolean).length;
        totalWords += wordCount;

        pages.push({
            pageNumber: i,
            content,
            wordCount,
        });
    }

    // Extract metadata
    const metadata = await doc.getMetadata();
    const info = metadata?.info as Record<string, string> | undefined;

    // Extract TOC (outlines/bookmarks)
    const outline = await doc.getOutline();
    const toc = outline
        ? outline.map((item, index) => ({
            title: item.title,
            pageNumber: index + 1,
            level: 0,
        }))
        : [];

    return {
        title: info?.Title || "Untitled",
        author: info?.Author || undefined,
        totalPages: doc.numPages,
        totalWords,
        pages,
        toc,
        metadata: info || {},
    };
}
