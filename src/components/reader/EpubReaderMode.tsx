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
        chapterTitle: string;
    }) => void;
    onTocReady?: (toc: TocItem[]) => void;
    onCenterTap?: () => void;
    fontSize?: number;
    lineHeight?: number;
    maxWidth?: number;
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
    onCenterTap,
    fontSize = 18,
    lineHeight = 1.65,
    maxWidth = 720,
}: EpubReaderModeProps) {
    const viewerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<Book | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const [isReady, setIsReady] = useState(false);

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
            const pageNum = Number(book.locations.locationFromCfi(loc.cfi)) || 1;
            const total = Number(book.locations.length()) || 1;

            // Find chapter title
            let chapterTitle = "";
            const navItem = book.navigation?.toc.find(
                (item) => loc.href.includes(item.href.split("#")[0])
            );
            if (navItem) {
                chapterTitle = navItem.label.trim();
            }

            if (onProgressChange) {
                onProgressChange({
                    percentage: Math.round(Number(percentage) * 100),
                    currentPage: pageNum,
                    totalPages: total,
                    chapterIndex: loc.index || 0,
                    cfi: loc.cfi,
                    chapterTitle,
                });
            }
        });

        // Keyboard navigation inside iframe
        rendition.on("keyup", (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                rendition.next();
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                rendition.prev();
            }
        });

        // Handle clicks inside the epub iframe for center-tap UI toggle
        // Must attach directly to iframe contentDocument since iframe blocks event propagation
        const onCenterTapRef = { current: onCenterTap };
        const attachIframeClickHandler = () => {
            const iframe = viewerRef.current?.querySelector("iframe");
            if (!iframe?.contentDocument) return;

            iframe.contentDocument.addEventListener("click", (e: MouseEvent) => {
                const w = iframe.contentDocument?.documentElement?.clientWidth || window.innerWidth;
                const x = e.clientX;
                const relX = x / w;

                if (relX < 0.25) {
                    rendition.prev();
                } else if (relX > 0.75) {
                    rendition.next();
                } else {
                    // Center tap — toggle UI
                    if (onCenterTapRef.current) onCenterTapRef.current();
                }
            });
        };

        // Re-attach on every new page render (epub.js recreates iframes)
        rendition.on("rendered", () => {
            setTimeout(attachIframeClickHandler, 100);
        });
        // Also try immediately
        setTimeout(attachIframeClickHandler, 500);

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

    return (
        <div
            className="epub-reader-clean"
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                background: "#000",
                overflow: "hidden",
            }}
        >
            {/* Loading indicator */}
            {!isReady && (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 5,
                }}>
                    <div style={{
                        width: 28, height: 28,
                        border: "2px solid #222",
                        borderTop: "2px solid #666",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                    }} />
                </div>
            )}

            {/* EPUB render container — fills entire viewport, no scrollbars */}
            <div
                ref={viewerRef}
                style={{
                    width: "100%",
                    height: "100%",
                    background: "#000",
                    overflow: "hidden",
                }}
            />
        </div>
    );
}
