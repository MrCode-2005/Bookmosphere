import type { ParsedBookData, ParsedPage } from "@/types";

const WORDS_PER_PAGE = 300;

/**
 * Parse a TXT file buffer into structured book data.
 * Simple paginator for plain text.
 */
export async function parseTXT(buffer: Buffer): Promise<ParsedBookData> {
    const fullText = buffer.toString("utf-8");
    const words = fullText.split(/\s+/).filter(Boolean);
    const totalWords = words.length;
    const totalPages = Math.max(1, Math.ceil(totalWords / WORDS_PER_PAGE));

    const pages: ParsedPage[] = [];

    for (let i = 0; i < totalPages; i++) {
        const startWord = i * WORDS_PER_PAGE;
        const endWord = Math.min(startWord + WORDS_PER_PAGE, totalWords);
        const pageWords = words.slice(startWord, endWord);
        const content = pageWords.join(" ");

        pages.push({
            pageNumber: i + 1,
            content,
            wordCount: pageWords.length,
        });
    }

    return {
        title: "Untitled Text",
        totalPages,
        totalWords,
        pages,
    };
}
