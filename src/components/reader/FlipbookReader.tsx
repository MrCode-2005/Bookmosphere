"use client";

import React, {
    useState,
    useCallback,
    useRef,
    useEffect,
    useMemo,
} from "react";

/* ────────── Types ────────── */

interface BookPage {
    pageNumber: number;
    content: string;
}

interface FlipbookReaderProps {
    pages?: BookPage[];
    pdfUrl?: string;
    fileType: string;
    totalPages: number;
    initialPage?: number;
    fontSize?: number;
    fontFamily?: string;
    lineSpacing?: number;
    onFlip?: () => void;
}

/* ────────── Event helper ────────── */

function emitPageChange(currentPage: number, totalPages: number) {
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent("bookflow:pagechange", {
                detail: { currentPage, totalPages },
            })
        );
    }
}

/* ────────── PDF page cache ────────── */

type PageCache = Map<number, HTMLCanvasElement>;

async function renderPdfPage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfDoc: any,
    pageNum: number,
    cache: PageCache,
    scale: number
): Promise<HTMLCanvasElement | null> {
    if (cache.has(pageNum)) return cache.get(pageNum)!;
    if (pageNum < 1 || pageNum > pdfDoc.numPages) return null;

    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        cache.set(pageNum, canvas);
        return canvas;
    } catch (err) {
        console.warn(`Failed to render PDF page ${pageNum}:`, err);
        return null;
    }
}

/* ═══════════════════════════════════════
   Main FlipbookReader
   ═══════════════════════════════════════ */

export default function FlipbookReader({
    pages,
    pdfUrl,
    fileType,
    totalPages,
    initialPage = 0,
    fontSize = 16,
    fontFamily = "Georgia, serif",
    lineSpacing = 1.8,
    onFlip,
}: FlipbookReaderProps) {
    const isPdf = fileType === "PDF" && !!pdfUrl;

    if (isPdf) {
        return (
            <PdfFlipbook
                pdfUrl={pdfUrl}
                totalPages={totalPages}
                initialPage={initialPage}
                onFlip={onFlip}
            />
        );
    }

    return (
        <TextFlipbook
            pages={pages || []}
            initialPage={initialPage}
            fontSize={fontSize}
            fontFamily={fontFamily}
            lineSpacing={lineSpacing}
            onFlip={onFlip}
        />
    );
}

/* ═══════════════════════════════════════
   PDF Flipbook — Heyzine-style
   ═══════════════════════════════════════ */

function PdfFlipbook({
    pdfUrl,
    totalPages,
    initialPage,
    onFlip,
}: {
    pdfUrl: string;
    totalPages: number;
    initialPage: number;
    onFlip?: () => void;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(initialPage || 1);
    const [isFlipping, setIsFlipping] = useState(false);
    const [flipDirection, setFlipDirection] = useState<"next" | "prev">("next");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const cacheRef = useRef<PageCache>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);

    // Determine if we're on the cover (page 1) or inner spread
    const isCover = currentPage === 1;
    // For inner pages: left page is even, right page is odd
    // Page 1 = cover (single), pages 2-3 = first spread, etc.
    const leftPageNum = isCover ? null : currentPage;
    const rightPageNum = isCover ? 1 : currentPage + 1;

    // Responsive scale
    const [scale, setScale] = useState(1.5);

    useEffect(() => {
        const updateScale = () => {
            const w = window.innerWidth;
            if (w < 768) setScale(0.8);
            else if (w < 1024) setScale(1.0);
            else if (w < 1440) setScale(1.3);
            else setScale(1.5);
        };
        updateScale();
        window.addEventListener("resize", updateScale);
        return () => window.removeEventListener("resize", updateScale);
    }, []);

    // Load PDF
    useEffect(() => {
        let cancelled = false;

        async function loadPdf() {
            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

                const loadingTask = pdfjsLib.getDocument(pdfUrl);
                const doc = await loadingTask.promise;

                if (!cancelled) {
                    setPdfDoc(doc);
                    setLoading(false);
                    emitPageChange(initialPage || 1, doc.numPages);
                }
            } catch (err) {
                console.error("PDF load error:", err);
                if (!cancelled) {
                    setError("Failed to load PDF");
                    setLoading(false);
                }
            }
        }

        loadPdf();
        return () => {
            cancelled = true;
        };
    }, [pdfUrl]);

    // Pre-render visible + adjacent pages
    useEffect(() => {
        if (!pdfDoc) return;

        const pagesToRender = new Set<number>();
        if (leftPageNum) pagesToRender.add(leftPageNum);
        if (rightPageNum && rightPageNum <= pdfDoc.numPages) pagesToRender.add(rightPageNum);
        // Pre-cache next 2 pages
        const nextStart = isCover ? 2 : currentPage + 2;
        for (let i = nextStart; i <= Math.min(nextStart + 1, pdfDoc.numPages); i++) {
            pagesToRender.add(i);
        }

        pagesToRender.forEach((num) => {
            renderPdfPage(pdfDoc, num, cacheRef.current, scale);
        });
    }, [pdfDoc, currentPage, scale]);

    // Navigation
    const goNext = useCallback(() => {
        if (isFlipping || !pdfDoc) return;
        const step = isCover ? 1 : 2;
        const nextPage = currentPage + step;
        if (nextPage > pdfDoc.numPages) return;

        setFlipDirection("next");
        setIsFlipping(true);
        onFlip?.();

        setTimeout(() => {
            setCurrentPage(nextPage);
            setIsFlipping(false);
            emitPageChange(nextPage, pdfDoc.numPages);
        }, 500);
    }, [isFlipping, pdfDoc, currentPage, isCover, onFlip]);

    const goPrev = useCallback(() => {
        if (isFlipping || !pdfDoc) return;
        if (currentPage <= 1) return;

        const prevPage = currentPage === 2 ? 1 : currentPage - 2;

        setFlipDirection("prev");
        setIsFlipping(true);
        onFlip?.();

        setTimeout(() => {
            setCurrentPage(prevPage);
            setIsFlipping(false);
            emitPageChange(prevPage, pdfDoc.numPages);
        }, 500);
    }, [isFlipping, pdfDoc, currentPage, onFlip]);

    // Keyboard
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                goNext();
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                goPrev();
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [goNext, goPrev]);

    // Touch swipe
    const touchStartX = useRef(0);
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: React.TouchEvent) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            diff > 0 ? goNext() : goPrev();
        }
    };

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-[#e8e4e0]">
                <div className="text-center space-y-3">
                    <div className="animate-spin w-8 h-8 border-2 border-gray-400/30 border-t-gray-500 rounded-full mx-auto" />
                    <p className="text-gray-500 text-sm">Loading PDF…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-[#e8e4e0]">
                <p className="text-red-500 text-sm">{error}</p>
            </div>
        );
    }

    const numPages = pdfDoc?.numPages || totalPages;

    return (
        <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center relative overflow-hidden select-none"
            style={{ background: "#d5d0cb" }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Book container */}
            <div
                className="relative flex items-stretch"
                style={{ perspective: "2500px" }}
            >
                {/* Page stack shadow (left — already read pages) */}
                {!isCover && (
                    <div
                        className="absolute pointer-events-none"
                        style={{
                            left: "-6px",
                            top: "3px",
                            bottom: "3px",
                            width: "8px",
                            background:
                                "linear-gradient(to left, #ccc 0px, #bbb 1px, #aaa 2px, transparent 8px)",
                            borderRadius: "2px 0 0 2px",
                        }}
                    />
                )}

                {/* Page stack shadow (right — remaining pages) */}
                <div
                    className="absolute pointer-events-none"
                    style={{
                        right: "-6px",
                        top: "3px",
                        bottom: "3px",
                        width: "8px",
                        background:
                            "linear-gradient(to right, #ccc 0px, #bbb 1px, #aaa 2px, transparent 8px)",
                        borderRadius: "0 2px 2px 0",
                    }}
                />

                {/* LEFT PAGE (only for spreads, not cover) */}
                {!isCover && (
                    <div
                        className="relative overflow-hidden"
                        style={{
                            width: `min(440px, 42vw)`,
                            height: `min(620px, 80vh)`,
                            background: "#fff",
                            boxShadow: "inset -2px 0 8px rgba(0,0,0,0.08)",
                        }}
                    >
                        <PdfPageCanvas
                            pdfDoc={pdfDoc}
                            pageNum={leftPageNum!}
                            cache={cacheRef.current}
                            scale={scale}
                        />
                    </div>
                )}

                {/* Spine */}
                {!isCover && (
                    <div
                        style={{
                            width: "4px",
                            background: "linear-gradient(to right, #bbb, #999, #bbb)",
                            boxShadow: "0 0 6px rgba(0,0,0,0.15)",
                        }}
                    />
                )}

                {/* RIGHT PAGE (always visible) */}
                <div
                    className="relative overflow-hidden"
                    style={{
                        width: `min(440px, 42vw)`,
                        height: `min(620px, 80vh)`,
                        background: "#fff",
                        boxShadow: isCover
                            ? "4px 4px 20px rgba(0,0,0,0.25), -2px 0 8px rgba(0,0,0,0.05)"
                            : "inset 2px 0 8px rgba(0,0,0,0.08)",
                    }}
                >
                    {rightPageNum && rightPageNum <= numPages ? (
                        <PdfPageCanvas
                            pdfDoc={pdfDoc}
                            pageNum={rightPageNum}
                            cache={cacheRef.current}
                            scale={scale}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                            End of book
                        </div>
                    )}
                </div>

                {/* Flip animation overlay */}
                {isFlipping && (
                    <FlipAnimation direction={flipDirection} isCover={isCover} />
                )}
            </div>

            {/* Navigation arrows */}
            <button
                onClick={goPrev}
                disabled={currentPage <= 1}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/60 hover:bg-white/90 flex items-center justify-center text-gray-600 disabled:opacity-0 transition-all z-20 shadow-md"
                aria-label="Previous page"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>
            <button
                onClick={goNext}
                disabled={
                    isCover
                        ? currentPage >= numPages
                        : currentPage + 1 >= numPages
                }
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/60 hover:bg-white/90 flex items-center justify-center text-gray-600 disabled:opacity-0 transition-all z-20 shadow-md"
                aria-label="Next page"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </button>

            {/* Bottom progress bar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                <span className="text-gray-500 text-xs font-mono">{currentPage}</span>
                <div className="relative w-48 h-1.5 bg-gray-400/30 rounded-full overflow-hidden">
                    <div
                        className="absolute inset-y-0 left-0 bg-gray-600 rounded-full transition-all duration-300"
                        style={{ width: `${(currentPage / numPages) * 100}%` }}
                    />
                </div>
                <span className="text-gray-500 text-xs font-mono">{numPages}</span>
            </div>
        </div>
    );
}

/* ────────── PDF Page Canvas ────────── */

function PdfPageCanvas({
    pdfDoc,
    pageNum,
    cache,
    scale,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfDoc: any;
    pageNum: number;
    cache: PageCache;
    scale: number;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [rendered, setRendered] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function render() {
            if (!pdfDoc || !containerRef.current) return;
            const canvas = await renderPdfPage(pdfDoc, pageNum, cache, scale);
            if (cancelled || !containerRef.current) return;

            // Clear previous
            containerRef.current.innerHTML = "";

            if (canvas) {
                // Make canvas fill the container
                canvas.style.width = "100%";
                canvas.style.height = "100%";
                canvas.style.objectFit = "contain";
                canvas.style.display = "block";
                containerRef.current.appendChild(canvas.cloneNode(true) as HTMLCanvasElement);

                // Clone the content from the cached canvas
                const displayCanvas = containerRef.current.querySelector("canvas")!;
                const ctx = displayCanvas.getContext("2d");
                if (ctx) {
                    displayCanvas.width = canvas.width;
                    displayCanvas.height = canvas.height;
                    ctx.drawImage(canvas, 0, 0);
                }
            }

            setRendered(true);
        }

        setRendered(false);
        render();

        return () => {
            cancelled = true;
        };
    }, [pdfDoc, pageNum, scale]);

    return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-white">
            {!rendered && (
                <div className="animate-pulse w-8 h-8 border-2 border-gray-300/30 border-t-gray-400 rounded-full" style={{ animation: "spin 1s linear infinite" }} />
            )}
        </div>
    );
}

/* ────────── Flip Animation ────────── */

function FlipAnimation({
    direction,
    isCover,
}: {
    direction: "next" | "prev";
    isCover: boolean;
}) {
    const isNext = direction === "next";
    const pageWidth = `min(440px, 42vw)`;
    const pageHeight = `min(620px, 80vh)`;

    return (
        <div
            className="absolute inset-0 pointer-events-none z-30"
            style={{ perspective: "2500px" }}
        >
            <div
                style={{
                    position: "absolute",
                    width: pageWidth,
                    height: pageHeight,
                    top: 0,
                    ...(isNext
                        ? { right: isCover ? 0 : `calc(50% + 2px)`, transformOrigin: isCover ? "left center" : "right center" }
                        : { left: isCover ? 0 : `calc(50% + 2px)`, transformOrigin: "left center" }),
                    background: "linear-gradient(to right, #f8f6f3, #fff)",
                    boxShadow: "0 0 30px rgba(0,0,0,0.2)",
                    animation: isNext
                        ? "flipNext 0.5s ease-in-out forwards"
                        : "flipPrev 0.5s ease-in-out forwards",
                    backfaceVisibility: "hidden",
                }}
            />
            <style>{`
                @keyframes flipNext {
                    0% { transform: rotateY(0deg); }
                    100% { transform: rotateY(-180deg); }
                }
                @keyframes flipPrev {
                    0% { transform: rotateY(-180deg); }
                    100% { transform: rotateY(0deg); }
                }
            `}</style>
        </div>
    );
}

/* ═══════════════════════════════════════
   Text Flipbook — for TXT files
   ═══════════════════════════════════════ */

function TextFlipbook({
    pages,
    initialPage,
    fontSize,
    fontFamily,
    lineSpacing,
    onFlip,
}: {
    pages: BookPage[];
    initialPage: number;
    fontSize: number;
    fontFamily: string;
    lineSpacing: number;
    onFlip?: () => void;
}) {
    const [spreadIndex, setSpreadIndex] = useState(Math.floor(initialPage / 2));
    const [isFlipping, setIsFlipping] = useState(false);
    const totalSpreads = Math.ceil(pages.length / 2);

    useEffect(() => {
        emitPageChange(spreadIndex * 2, pages.length);
    }, []);

    const goNext = useCallback(() => {
        if (isFlipping || spreadIndex >= totalSpreads - 1) return;
        setIsFlipping(true);
        const next = spreadIndex + 1;
        onFlip?.();
        setTimeout(() => {
            setSpreadIndex(next);
            setIsFlipping(false);
            emitPageChange(next * 2, pages.length);
        }, 400);
    }, [isFlipping, spreadIndex, totalSpreads, pages.length, onFlip]);

    const goPrev = useCallback(() => {
        if (isFlipping || spreadIndex <= 0) return;
        setIsFlipping(true);
        const prev = spreadIndex - 1;
        onFlip?.();
        setTimeout(() => {
            setSpreadIndex(prev);
            setIsFlipping(false);
            emitPageChange(prev * 2, pages.length);
        }, 400);
    }, [isFlipping, spreadIndex, pages.length, onFlip]);

    // Keyboard
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                goNext();
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                goPrev();
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [goNext, goPrev]);

    // Touch
    const touchStartX = useRef(0);
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: React.TouchEvent) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            diff > 0 ? goNext() : goPrev();
        }
    };

    const leftPage = pages[spreadIndex * 2] || null;
    const rightPage = pages[spreadIndex * 2 + 1] || null;

    return (
        <div
            className="w-full h-full flex items-center justify-center relative overflow-hidden select-none"
            style={{ background: "#d5d0cb" }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className="relative flex" style={{ perspective: "2000px" }}>
                {/* Left page */}
                <div style={{ width: "min(440px, 42vw)", height: "min(620px, 80vh)" }}>
                    {leftPage ? (
                        <TextPage page={leftPage} totalPages={pages.length} side="left" fontSize={fontSize} fontFamily={fontFamily} lineSpacing={lineSpacing} />
                    ) : (
                        <div className="w-full h-full bg-[#faf8f5]" style={{ boxShadow: "inset -4px 0 12px rgba(0,0,0,0.08)" }} />
                    )}
                </div>
                <div style={{ width: "4px", background: "linear-gradient(to right, #bbb, #999, #bbb)" }} />
                {/* Right page */}
                <div style={{ width: "min(440px, 42vw)", height: "min(620px, 80vh)" }}>
                    {rightPage ? (
                        <TextPage page={rightPage} totalPages={pages.length} side="right" fontSize={fontSize} fontFamily={fontFamily} lineSpacing={lineSpacing} />
                    ) : (
                        <div className="w-full h-full bg-[#f5f0eb]" style={{ boxShadow: "inset 4px 0 12px rgba(0,0,0,0.08)" }} />
                    )}
                </div>
            </div>

            {/* Navigation */}
            <button onClick={goPrev} disabled={spreadIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/60 hover:bg-white/90 flex items-center justify-center text-gray-600 disabled:opacity-0 transition-all z-20 shadow-md" aria-label="Previous">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button onClick={goNext} disabled={spreadIndex >= totalSpreads - 1} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/60 hover:bg-white/90 flex items-center justify-center text-gray-600 disabled:opacity-0 transition-all z-20 shadow-md" aria-label="Next">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>

            {/* Hint */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 z-20">
                ← → to navigate · Space for next
            </div>
        </div>
    );
}

/* ────────── Text Page ────────── */

function TextPage({
    page,
    totalPages,
    side,
    fontSize,
    fontFamily,
    lineSpacing,
}: {
    page: BookPage;
    totalPages: number;
    side: "left" | "right";
    fontSize: number;
    fontFamily: string;
    lineSpacing: number;
}) {
    return (
        <div
            className="w-full h-full flex flex-col relative overflow-hidden"
            style={{
                background: "#faf8f5",
                boxShadow:
                    side === "left"
                        ? "inset -4px 0 12px rgba(0,0,0,0.08)"
                        : "inset 4px 0 12px rgba(0,0,0,0.08)",
            }}
        >
            <div
                className="flex-1 overflow-y-auto"
                style={{
                    padding: "36px 32px 16px",
                    fontSize: `${fontSize}px`,
                    fontFamily,
                    lineHeight: lineSpacing,
                    color: "#2a2420",
                    wordBreak: "break-word",
                    textAlign: "justify",
                    letterSpacing: "0.01em",
                    whiteSpace: "pre-wrap",
                }}
            >
                {page.content}
            </div>
            <div
                className="px-8 py-3 select-none"
                style={{
                    textAlign: side === "left" ? "left" : "right",
                    fontSize: "11px",
                    fontFamily: "Georgia, serif",
                    color: "#9a8e82",
                }}
            >
                {page.pageNumber} / {totalPages}
            </div>
        </div>
    );
}
