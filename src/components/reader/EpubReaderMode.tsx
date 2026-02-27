"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ePub, { Book, Rendition } from "epubjs";
import "@/styles/reader-mode.css";

interface EpubReaderModeProps {
    epubUrl: string;
    bookId: string;
    initialCfi?: string;
    initialChapter?: number;
    onProgressChange?: (progress: {
        percentage: number;
        currentPage: number;
        totalPages: number;
        chapterIndex: number;
        cfi: string;
    }) => void;
    onTocReady?: (toc: TocItem[]) => void;
    fontSize?: number;       // 17-19
    lineHeight?: number;     // 1.6-1.75
    maxWidth?: number;       // 680-760
}

export interface TocItem {
    label: string;
    href: string;
    subitems?: TocItem[];
}

export default function EpubReaderMode({
    epubUrl,
    bookId,
    initialCfi,
    initialChapter,
    onProgressChange,
    onTocReady,
    fontSize = 18,
    lineHeight = 1.65,
    maxWidth = 720,
}: EpubReaderModeProps) {
    const viewerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<Book | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isReady, setIsReady] = useState(false);
    const [chapterTitle, setChapterTitle] = useState("");

    const updateTheme = useCallback((rendition: Rendition) => {
        rendition.themes.default({
            "body": {
                "background": "#000000 !important",
                "color": "#F2F2F2 !important",
                "font-family": "Georgia, 'Times New Roman', serif !important",
                "font-size": `${fontSize}px !important`,
                "line-height": `${lineHeight} !important`,
                "max-width": `${maxWidth}px !important`,
                "margin": "0 auto !important",
                "padding": "40px 20px !important",
                "-webkit-font-smoothing": "antialiased",
            },
            "p": {
                "margin-bottom": "1.2em !important",
                "color": "#F2F2F2 !important",
                "text-align": "justify",
                "hyphens": "auto",
            },
            "h1": {
                "font-size": `${fontSize * 1.6}px !important`,
                "font-weight": "600 !important",
                "color": "#F2F2F2 !important",
                "margin": "2em 0 0.8em !important",
                "line-height": "1.3 !important",
            },
            "h2": {
                "font-size": `${fontSize * 1.4}px !important`,
                "font-weight": "600 !important",
                "color": "#F2F2F2 !important",
                "margin": "1.8em 0 0.6em !important",
                "line-height": "1.35 !important",
            },
            "h3": {
                "font-size": `${fontSize * 1.2}px !important`,
                "font-weight": "600 !important",
                "color": "#F2F2F2 !important",
                "margin": "1.5em 0 0.5em !important",
            },
            "h4, h5, h6": {
                "font-size": `${fontSize}px !important`,
                "font-weight": "600 !important",
                "color": "#F2F2F2 !important",
            },
            "blockquote": {
                "border-left": "3px solid #333 !important",
                "padding-left": "1.2em !important",
                "color": "#B0B0B0 !important",
                "font-style": "italic !important",
            },
            "a": {
                "color": "#93B5FF !important",
                "text-decoration": "none !important",
            },
            "img": {
                "max-width": "100% !important",
                "height": "auto !important",
                "display": "block !important",
                "margin": "1.5em auto !important",
            },
            "pre": {
                "background": "#111111 !important",
                "border": "1px solid #222 !important",
                "border-radius": "6px !important",
                "padding": "1em !important",
                "font-family": "'SF Mono', Menlo, Monaco, monospace !important",
                "font-size": "0.85em !important",
            },
            "code": {
                "background": "#111111 !important",
                "padding": "0.15em 0.4em !important",
                "border-radius": "3px !important",
                "font-size": "0.88em !important",
            },
            "table": {
                "border-collapse": "collapse !important",
                "width": "100% !important",
            },
            "th, td": {
                "border": "1px solid #333 !important",
                "padding": "0.6em 0.8em !important",
                "color": "#F2F2F2 !important",
            },
            "th": {
                "background": "#111 !important",
            },
            "hr": {
                "border": "none !important",
                "height": "1px !important",
                "background": "#222 !important",
            },
            "ul, ol": {
                "padding-left": "1.5em !important",
            },
            "li": {
                "color": "#F2F2F2 !important",
                "margin-bottom": "0.4em !important",
            },
            "figcaption, small, .caption": {
                "color": "#B0B0B0 !important",
                "font-size": "0.85em !important",
            },
        });
    }, [fontSize, lineHeight, maxWidth]);

    useEffect(() => {
        if (!viewerRef.current || !epubUrl) return;

        const book = ePub(epubUrl);
        bookRef.current = book;

        const rendition = book.renderTo(viewerRef.current, {
            width: "100%",
            height: "100%",
            flow: "paginated",
            spread: "none",
        });
        renditionRef.current = rendition;

        // Apply Apple Books dark theme
        updateTheme(rendition);

        // Display at initial position or start
        if (initialCfi) {
            rendition.display(initialCfi);
        } else if (initialChapter !== undefined && initialChapter > 0) {
            book.ready.then(() => {
                const spine = book.spine as unknown as { items: { href: string }[] };
                if (spine.items && spine.items[initialChapter]) {
                    rendition.display(spine.items[initialChapter].href);
                } else {
                    rendition.display();
                }
            });
        } else {
            rendition.display();
        }

        // Generate locations for progress tracking
        book.ready.then(() => {
            return book.locations.generate(1024);
        }).then(() => {
            setTotalPages(book.locations.length());
            setIsReady(true);
        });

        // TOC
        book.loaded.navigation.then((nav) => {
            if (onTocReady) {
                const toc: TocItem[] = nav.toc.map((item) => ({
                    label: item.label.trim(),
                    href: item.href,
                    subitems: item.subitems?.map((sub) => ({
                        label: sub.label.trim(),
                        href: sub.href,
                    })),
                }));
                onTocReady(toc);
            }
        });

        // Track location changes
        rendition.on("relocated", (location: { start: { cfi: string; displayed: { page: number; total: number }; href: string; index: number } }) => {
            const loc = location.start;
            const percentage = book.locations.percentageFromCfi(loc.cfi);
            const pageNum = book.locations.locationFromCfi(loc.cfi) || 1;
            const total = book.locations.length();

            setCurrentPage(pageNum);
            setTotalPages(total);

            // Find chapter title
            const navItem = book.navigation?.toc.find(
                (item) => loc.href.includes(item.href.split("#")[0])
            );
            if (navItem) {
                setChapterTitle(navItem.label.trim());
            }

            if (onProgressChange) {
                onProgressChange({
                    percentage: Math.round(percentage * 100),
                    currentPage: pageNum,
                    totalPages: total,
                    chapterIndex: loc.index || 0,
                    cfi: loc.cfi,
                });
            }
        });

        // Keyboard navigation
        rendition.on("keyup", (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                rendition.next();
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                rendition.prev();
            }
        });

        return () => {
            book.destroy();
            bookRef.current = null;
            renditionRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [epubUrl, bookId]);

    // Update theme when settings change
    useEffect(() => {
        if (renditionRef.current) {
            updateTheme(renditionRef.current);
        }
    }, [fontSize, lineHeight, maxWidth, updateTheme]);

    // Global keyboard handler
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (!renditionRef.current) return;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                renditionRef.current.next();
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                renditionRef.current.prev();
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, []);

    const goNext = useCallback(() => renditionRef.current?.next(), []);
    const goPrev = useCallback(() => renditionRef.current?.prev(), []);

    // Navigate to specific chapter
    const goToChapter = useCallback((href: string) => {
        renditionRef.current?.display(href);
    }, []);

    // Navigate to CFI
    const goToCfi = useCallback((cfi: string) => {
        renditionRef.current?.display(cfi);
    }, []);

    return (
        <div className="reader-mode" style={{ position: "relative", width: "100%", height: "100%" }}>
            {/* Chapter info bar */}
            {chapterTitle && (
                <div style={{
                    position: "absolute",
                    top: 12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: "#666",
                    fontSize: 12,
                    fontFamily: "system-ui, sans-serif",
                    zIndex: 10,
                    pointerEvents: "none",
                    maxWidth: "60%",
                    textAlign: "center",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                }}>
                    {chapterTitle}
                </div>
            )}

            {/* EPUB render container */}
            <div
                ref={viewerRef}
                style={{
                    width: "100%",
                    height: "100%",
                    background: "#000",
                }}
                onClick={(e) => {
                    // Click left/right halves for navigation
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    if (x < rect.width * 0.3) goPrev();
                    else if (x > rect.width * 0.7) goNext();
                }}
            />

            {/* Page indicator */}
            {isReady && (
                <div style={{
                    position: "absolute",
                    bottom: 12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: "#444",
                    fontSize: 11,
                    fontFamily: "system-ui, sans-serif",
                    zIndex: 10,
                    pointerEvents: "none",
                }}>
                    {currentPage} / {totalPages}
                </div>
            )}

            {/* Expose navigation methods via data attributes for parent */}
            <div
                data-epub-controls
                style={{ display: "none" }}
                ref={(el) => {
                    if (el) {
                        (el as HTMLDivElement & {
                            goNext: () => void;
                            goPrev: () => void;
                            goToChapter: (href: string) => void;
                            goToCfi: (cfi: string) => void;
                        }).goNext = goNext;
                        (el as HTMLDivElement & {
                            goNext: () => void;
                            goPrev: () => void;
                            goToChapter: (href: string) => void;
                            goToCfi: (cfi: string) => void;
                        }).goPrev = goPrev;
                        (el as HTMLDivElement & {
                            goNext: () => void;
                            goPrev: () => void;
                            goToChapter: (href: string) => void;
                            goToCfi: (cfi: string) => void;
                        }).goToChapter = goToChapter;
                        (el as HTMLDivElement & {
                            goNext: () => void;
                            goPrev: () => void;
                            goToChapter: (href: string) => void;
                            goToCfi: (cfi: string) => void;
                        }).goToCfi = goToCfi;
                    }
                }}
            />
        </div>
    );
}
