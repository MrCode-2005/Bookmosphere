import type { ParsedBookData, ParsedPage } from "@/types";

/**
 * Parse an EPUB file buffer into structured book data.
 * Uses epubjs for server-side extraction.
 */
export async function parseEPUB(buffer: Buffer): Promise<ParsedBookData> {
    // epubjs works with ArrayBuffer
    const ePub = (await import("epubjs")).default;
    const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    );

    const book = ePub(arrayBuffer as ArrayBuffer);
    await book.ready;

    const pages: ParsedPage[] = [];
    let totalWords = 0;
    let pageNumber = 1;

    // Get spine items (chapters)
    const spine = book.spine as unknown as { each: (fn: (section: { load: (fn: (contents: Document) => void) => Promise<void> }) => void) => void };

    const sections: { load: (fn: (contents: Document) => void) => Promise<void> }[] = [];
    spine.each((section) => sections.push(section));

    for (const section of sections) {
        try {
            await section.load((contents: Document) => {
                const text = contents.body?.textContent || "";
                const wordCount = text.split(/\s+/).filter(Boolean).length;
                totalWords += wordCount;

                pages.push({
                    pageNumber: pageNumber++,
                    content: text,
                    wordCount,
                });
            });
        } catch {
            // Skip sections that fail to load
        }
    }

    // Extract metadata
    const metadata = await book.loaded.metadata;

    return {
        title: metadata?.title || "Untitled",
        author: metadata?.creator || undefined,
        totalPages: pages.length,
        totalWords,
        pages,
        toc: [],
        metadata: metadata as unknown as Record<string, unknown>,
    };
}
