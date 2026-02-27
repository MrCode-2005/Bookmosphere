"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ePub, { Book } from "epubjs";

interface EpubFlipModeProps {
    epubUrl: string;
    bookId: string;
    initialChapter?: number;
    onProgressChange?: (progress: {
        percentage: number;
        currentPage: number;
        totalPages: number;
        chapterIndex: number;
    }) => void;
    onTocReady?: (toc: { label: string; href: string }[]) => void;
}

/**
 * EPUB Flip Mode: Paginates EPUB content into discrete pages
 * and renders through a two-page layout with flip-style navigation.
 * For EPUBs that don't have a PDF — renders EPUB content as paginated HTML.
 */
export default function EpubFlipMode({
    epubUrl,
    bookId,
    initialChapter,
    onProgressChange,
    onTocReady,
}: EpubFlipModeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<Book | null>(null);
    const [pages, setPages] = useState<string[]>([]);
    const [currentSpread, setCurrentSpread] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Extract all chapter content as HTML pages
    useEffect(() => {
        if (!epubUrl) return;

        const book = ePub(epubUrl);
        bookRef.current = book;

        book.ready.then(async () => {
            // Get TOC
            const nav = await book.loaded.navigation;
            if (onTocReady) {
                onTocReady(nav.toc.map((item) => ({
                    label: item.label.trim(),
                    href: item.href,
                })));
            }

            // Extract content from each spine item
            const allPages: string[] = [];
            const spine = book.spine as unknown as { items: { href: string; index: number }[] };

            for (const item of spine.items) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const section = (book.spine as any).get(item.index || item.href);
                    if (section) {
                        await section.load(book.load.bind(book));
                        const content = section.document?.body?.innerHTML || "";
                        if (content.trim()) {
                            allPages.push(content);
                        }
                    }
                } catch {
                    // Skip failed sections
                }
            }

            setPages(allPages);
            setTotalPages(allPages.length);
            setIsLoading(false);

            // Jump to initial chapter
            if (initialChapter && initialChapter > 0 && initialChapter < allPages.length) {
                setCurrentSpread(Math.floor(initialChapter / 2));
            }
        });

        return () => {
            book.destroy();
            bookRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [epubUrl, bookId]);

    // Report progress
    useEffect(() => {
        if (!onProgressChange || totalPages === 0) return;
        const currentPage = currentSpread * 2;
        onProgressChange({
            percentage: Math.round((currentPage / totalPages) * 100),
            currentPage: currentPage + 1,
            totalPages,
            chapterIndex: currentPage,
        });
    }, [currentSpread, totalPages, onProgressChange]);

    const nextPage = useCallback(() => {
        setCurrentSpread((s) => Math.min(s + 1, Math.ceil(totalPages / 2) - 1));
    }, [totalPages]);

    const prevPage = useCallback(() => {
        setCurrentSpread((s) => Math.max(s - 1, 0));
    }, []);

    // Keyboard navigation
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") nextPage();
            if (e.key === "ArrowLeft") prevPage();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [nextPage, prevPage]);

    const leftPageIndex = currentSpread * 2;
    const rightPageIndex = currentSpread * 2 + 1;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center w-full h-full" style={{ background: "#000" }}>
                <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full mx-auto mb-4" />
                    <p style={{ color: "#666", fontSize: 14 }}>Loading EPUB for flip view...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="flex items-center justify-center w-full h-full"
            style={{ background: "#000", gap: 4, padding: 20 }}
            onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const x = e.clientX - rect.left;
                if (x < rect.width * 0.35) prevPage();
                else if (x > rect.width * 0.65) nextPage();
            }}
        >
            {/* Left Page */}
            <div
                style={{
                    width: "48%",
                    height: "90%",
                    background: "#0a0a0a",
                    borderRadius: "4px 0 0 4px",
                    boxShadow: "inset -4px 0 12px rgba(0,0,0,0.5)",
                    overflow: "hidden",
                    padding: 30,
                    color: "#F2F2F2",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: 16,
                    lineHeight: 1.65,
                }}
            >
                {pages[leftPageIndex] ? (
                    <div
                        dangerouslySetInnerHTML={{ __html: pages[leftPageIndex] }}
                        style={{ overflow: "hidden", height: "100%" }}
                    />
                ) : (
                    <div style={{ color: "#333", textAlign: "center", paddingTop: "40%" }}>
                        End of book
                    </div>
                )}
            </div>

            {/* Center gutter */}
            <div style={{
                width: 2,
                height: "88%",
                background: "linear-gradient(to bottom, transparent, #222, transparent)",
            }} />

            {/* Right Page */}
            <div
                style={{
                    width: "48%",
                    height: "90%",
                    background: "#0a0a0a",
                    borderRadius: "0 4px 4px 0",
                    boxShadow: "inset 4px 0 12px rgba(0,0,0,0.5)",
                    overflow: "hidden",
                    padding: 30,
                    color: "#F2F2F2",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: 16,
                    lineHeight: 1.65,
                }}
            >
                {pages[rightPageIndex] ? (
                    <div
                        dangerouslySetInnerHTML={{ __html: pages[rightPageIndex] }}
                        style={{ overflow: "hidden", height: "100%" }}
                    />
                ) : (
                    <div style={{ color: "#333", textAlign: "center", paddingTop: "40%" }}>
                        {leftPageIndex < totalPages ? "" : "End of book"}
                    </div>
                )}
            </div>

            {/* Page indicator */}
            <div style={{
                position: "absolute",
                bottom: 16,
                left: "50%",
                transform: "translateX(-50%)",
                color: "#444",
                fontSize: 12,
                fontFamily: "system-ui, sans-serif",
            }}>
                {leftPageIndex + 1}–{Math.min(rightPageIndex + 1, totalPages)} / {totalPages}
            </div>
        </div>
    );
}
