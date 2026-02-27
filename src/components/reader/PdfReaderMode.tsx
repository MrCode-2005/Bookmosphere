"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import "@/styles/reader-mode.css";

interface PdfReaderModeProps {
    pdfUrl: string;
    bookId: string;
    totalPages: number;
    initialPage?: number;
    fontSize?: number;
    lineHeight?: number;
    maxWidth?: number;
    onProgressChange?: (progress: {
        percentage: number;
        currentPage: number;
        totalPages: number;
        chapterIndex: number;
    }) => void;
}

interface PageContent {
    pageNumber: number;
    text: string;
}

/**
 * PDF Reader Mode — extracts text directly from the PDF using pdfjs-dist
 * and renders it in Apple Books dark mode typography.
 * No EPUB conversion needed. Works immediately on any uploaded PDF.
 */
export default function PdfReaderMode({
    pdfUrl,
    bookId,
    totalPages,
    initialPage = 0,
    fontSize = 18,
    lineHeight = 1.65,
    maxWidth = 720,
    onProgressChange,
}: PdfReaderModeProps) {
    const [pages, setPages] = useState<PageContent[]>([]);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [isLoading, setIsLoading] = useState(true);
    const [extractedCount, setExtractedCount] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    // Extract text from PDF
    useEffect(() => {
        if (!pdfUrl) return;

        let cancelled = false;

        const extractText = async () => {
            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

                const loadingTask = pdfjsLib.getDocument(pdfUrl);
                const pdf = await loadingTask.promise;
                const numPages = pdf.numPages;

                const extractedPages: PageContent[] = [];

                // Extract in batches for responsiveness
                for (let i = 1; i <= numPages; i++) {
                    if (cancelled) return;

                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();

                    // Build structured text from PDF text items
                    let pageText = "";
                    let lastY = -1;

                    for (const item of textContent.items) {
                        if ("str" in item) {
                            const y = Math.round((item.transform?.[5] || 0) * 10) / 10;
                            // New line when Y position changes significantly
                            if (lastY !== -1 && Math.abs(y - lastY) > 2) {
                                pageText += "\n";
                            }
                            pageText += item.str;
                            if (item.hasEOL) {
                                pageText += "\n";
                            }
                            lastY = y;
                        }
                    }

                    extractedPages.push({
                        pageNumber: i,
                        text: pageText.trim(),
                    });

                    if (!cancelled) {
                        setExtractedCount(i);
                    }
                }

                if (!cancelled) {
                    setPages(extractedPages);
                    setIsLoading(false);
                }
            } catch (error) {
                console.error("PDF text extraction failed:", error);
                if (!cancelled) setIsLoading(false);
            }
        };

        extractText();
        return () => { cancelled = true; };
    }, [pdfUrl, bookId]);

    // Scroll to initial page once loaded
    useEffect(() => {
        if (!isLoading && initialPage > 0 && pages.length > 0) {
            const el = pageRefs.current.get(initialPage);
            if (el) {
                el.scrollIntoView({ behavior: "auto", block: "start" });
            }
        }
    }, [isLoading, initialPage, pages.length]);

    // Track scroll position to update current page
    useEffect(() => {
        const container = containerRef.current;
        if (!container || pages.length === 0) return;

        const handleScroll = () => {
            const containerRect = container.getBoundingClientRect();
            const viewMid = containerRect.top + containerRect.height / 3;

            let closestPage = 0;
            let closestDist = Infinity;

            pageRefs.current.forEach((el, pageNum) => {
                const rect = el.getBoundingClientRect();
                const dist = Math.abs(rect.top - viewMid);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestPage = pageNum;
                }
            });

            if (closestPage !== currentPage) {
                setCurrentPage(closestPage);
            }
        };

        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => container.removeEventListener("scroll", handleScroll);
    }, [pages.length, currentPage]);

    // Report progress
    useEffect(() => {
        if (!onProgressChange || pages.length === 0) return;
        const total = pages.length;
        onProgressChange({
            percentage: Math.round(((currentPage + 1) / total) * 100),
            currentPage: currentPage + 1,
            totalPages: total,
            chapterIndex: currentPage,
        });
    }, [currentPage, pages.length, onProgressChange]);

    // Keyboard navigation
    const scrollToPage = useCallback((pageNum: number) => {
        const el = pageRefs.current.get(pageNum);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                scrollToPage(Math.min(currentPage + 1, pages.length - 1));
            } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                scrollToPage(Math.max(currentPage - 1, 0));
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [currentPage, pages.length, scrollToPage]);

    // Convert raw text to paragraphs
    const formatText = (text: string) => {
        if (!text) return null;

        // Split into paragraphs by double newlines or significant gaps
        const blocks = text.split(/\n{2,}/).filter((b) => b.trim());

        if (blocks.length === 0) {
            // Fallback: split by single newlines
            const lines = text.split("\n").filter((l) => l.trim());
            return lines.map((line, i) => (
                <p key={i} style={{ marginBottom: "0.8em" }}>{line.trim()}</p>
            ));
        }

        return blocks.map((block, i) => {
            const trimmed = block.trim();
            // Detect headings (short, uppercase lines or lines ending with common patterns)
            const isHeading = trimmed.length < 80 &&
                (trimmed === trimmed.toUpperCase() && trimmed.length > 3) ||
                /^(chapter|part|section|book)\s+/i.test(trimmed);

            if (isHeading) {
                return (
                    <h2 key={i} style={{
                        fontSize: `${fontSize * 1.4}px`,
                        fontWeight: 600,
                        margin: "1.8em 0 0.6em",
                        lineHeight: 1.35,
                    }}>
                        {trimmed}
                    </h2>
                );
            }

            return (
                <p key={i} style={{ marginBottom: "1.2em" }}>
                    {trimmed}
                </p>
            );
        });
    };

    if (isLoading) {
        return (
            <div className="reader-mode" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <div style={{ textAlign: "center" }}>
                    <div className="animate-spin" style={{
                        width: 32, height: 32,
                        border: "2px solid #333",
                        borderTop: "2px solid #93B5FF",
                        borderRadius: "50%",
                        margin: "0 auto 16px",
                    }} />
                    <p style={{ color: "#666", fontSize: 14 }}>
                        Extracting text... {extractedCount}/{totalPages || "?"} pages
                    </p>
                </div>
            </div>
        );
    }

    if (pages.length === 0) {
        return (
            <div className="reader-mode" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <p style={{ color: "#666", fontSize: 14 }}>
                    This PDF doesn&apos;t contain extractable text. Try Flip Mode instead.
                </p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="reader-mode"
            style={{
                height: "100%",
                overflow: "auto",
                padding: "0 20px",
                scrollBehavior: "smooth",
            }}
        >
            <div
                className="reader-mode-content"
                style={{
                    maxWidth,
                    margin: "0 auto",
                    paddingTop: 40,
                    paddingBottom: 60,
                    fontSize,
                    lineHeight,
                }}
            >
                {pages.map((page) => (
                    <div
                        key={page.pageNumber}
                        ref={(el) => {
                            if (el) pageRefs.current.set(page.pageNumber - 1, el);
                        }}
                        style={{
                            marginBottom: "3em",
                            paddingBottom: "2em",
                            borderBottom: "1px solid #111",
                        }}
                    >
                        {/* Page number indicator */}
                        <div style={{
                            color: "#333",
                            fontSize: 11,
                            fontFamily: "system-ui, sans-serif",
                            marginBottom: 16,
                            textAlign: "center",
                        }}>
                            — {page.pageNumber} —
                        </div>

                        {/* Page content */}
                        {formatText(page.text)}
                    </div>
                ))}

                {/* End of book */}
                <div style={{ textAlign: "center", padding: "40px 0", color: "#333", fontSize: 13 }}>
                    — End —
                </div>
            </div>

            {/* Page indicator */}
            <div style={{
                position: "fixed",
                bottom: 50,
                right: 20,
                color: "#333",
                fontSize: 11,
                fontFamily: "system-ui, sans-serif",
                background: "#0a0a0a",
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #1a1a1a",
                zIndex: 10,
            }}>
                {currentPage + 1} / {pages.length}
            </div>
        </div>
    );
}
