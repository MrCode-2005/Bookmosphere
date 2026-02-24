"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PageFlip, FlipCorner } from "@/lib/page-flip";
import "@/lib/page-flip/Style/stPageFlip.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/* ─── Emit page change to parent ─── */
function emitPageChange(currentPage: number, totalPages: number) {
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent("bookflow:pagechange", {
                detail: { currentPage, totalPages },
            })
        );
    }
}

/* ─── Types ─── */
interface PdfFlipbookReaderProps {
    pdfUrl: string;
    totalPages: number;
    initialPage?: number;
    onFlip?: () => void;
    soundEnabled?: boolean;
    onToggleSound?: () => void;
}

/* ═══════════════════════════════════════════════
 *    PdfFlipbookReader — StPageFlip Integration
 *    Real drag-to-flip, corner hover, swipe, shadows
 * ═══════════════════════════════════════════════ */
export default function PdfFlipbookReader({
    pdfUrl,
    totalPages: totalPagesHint,
    initialPage = 1,
    onFlip,
    soundEnabled = true,
    onToggleSound,
}: PdfFlipbookReaderProps) {
    /* ─── State ─── */
    const [totalPages, setTotalPages] = useState(totalPagesHint || 0);
    const [currentPage, setCurrentPage] = useState(initialPage - 1); // 0-indexed
    const [pdfReady, setPdfReady] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [thumbnailMode, setThumbnailMode] = useState(false);

    /* ─── Refs ─── */
    const containerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<HTMLDivElement>(null);
    const pageFlipRef = useRef<PageFlip | null>(null);
    const pageImagesRef = useRef<string[]>([]);
    const pdfDocRef = useRef<any>(null);
    const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);

    /* ─── PDF Page dimensions ─── */
    const PAGE_WIDTH = 550;
    const PAGE_HEIGHT = 733;

    /* ─── Pre-render all PDF pages to images ─── */
    const renderAllPages = useCallback(async () => {
        if (!pdfDocRef.current) return;
        const doc = pdfDocRef.current;
        const numPages = doc.numPages;
        setTotalPages(numPages);

        // Create an offscreen canvas for rendering
        if (!renderCanvasRef.current) {
            renderCanvasRef.current = document.createElement("canvas");
        }
        const canvas = renderCanvasRef.current;
        const ctx = canvas.getContext("2d")!;

        const images: string[] = [];
        const scale = 2; // Higher resolution rendering

        for (let i = 1; i <= numPages; i++) {
            try {
                const page = await doc.getPage(i);
                const viewport = page.getViewport({ scale });
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                // Clear canvas
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({ canvasContext: ctx, viewport }).promise;

                // Convert to data URL
                const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
                images.push(dataUrl);

                // Update progress
                setLoadingProgress(Math.round((i / numPages) * 100));
            } catch (err) {
                console.error(`Error rendering page ${i}:`, err);
                // Create blank white page as fallback
                canvas.width = PAGE_WIDTH * scale;
                canvas.height = PAGE_HEIGHT * scale;
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#cccccc";
                ctx.font = "24px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(`Page ${i}`, canvas.width / 2, canvas.height / 2);
                images.push(canvas.toDataURL("image/jpeg", 0.92));
            }
        }

        pageImagesRef.current = images;
        setPdfReady(true);
    }, []);

    /* ─── Load PDF document ─── */
    const onDocumentLoadSuccess = useCallback(
        async (pdf: any) => {
            pdfDocRef.current = pdf._pdfInfo ? pdf : pdf;
            // Get the underlying pdf.js document
            const loadingTask = pdfjs.getDocument(pdfUrl);
            const doc = await loadingTask.promise;
            pdfDocRef.current = doc;
            await renderAllPages();
        },
        [pdfUrl, renderAllPages]
    );

    /* ─── Initialize PageFlip once images are ready ─── */
    useEffect(() => {
        if (!pdfReady || !bookRef.current || pageImagesRef.current.length === 0) return;
        if (pageFlipRef.current) return; // Already initialized

        const bookEl = bookRef.current;

        const pf = new PageFlip(bookEl, {
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            size: "stretch" as any,
            minWidth: 300,
            maxWidth: 800,
            minHeight: 400,
            maxHeight: 1066,
            maxShadowOpacity: 0.5,
            showCover: true,
            flippingTime: 800,
            usePortrait: true,
            drawShadow: true,
            mobileScrollSupport: true,
            startPage: Math.max(0, initialPage - 1),
            autoSize: true,
            showPageCorners: true,
            disableFlipByClick: false,
        });

        pf.loadFromImages(pageImagesRef.current);

        // Listen to flip events
        pf.on("flip", (e) => {
            const pageIndex = e.data as number;
            setCurrentPage(pageIndex);
            emitPageChange(pageIndex, totalPages);
            if (onFlip) onFlip();
        });

        pf.on("changeOrientation", (e) => {
            // Orientation changed, book auto-adjusts
        });

        pageFlipRef.current = pf;

        // Initial page event
        emitPageChange(Math.max(0, initialPage - 1), totalPages);

        return () => {
            if (pageFlipRef.current) {
                try {
                    pageFlipRef.current.destroy();
                } catch {
                    // ignore destroy errors
                }
                pageFlipRef.current = null;
            }
        };
    }, [pdfReady, totalPages, initialPage, onFlip]);

    /* ─── Navigation ─── */
    const flipNext = useCallback(() => {
        if (pageFlipRef.current) {
            pageFlipRef.current.flipNext(FlipCorner.BOTTOM);
        }
    }, []);

    const flipPrev = useCallback(() => {
        if (pageFlipRef.current) {
            pageFlipRef.current.flipPrev(FlipCorner.BOTTOM);
        }
    }, []);

    /* ─── Keyboard nav ─── */
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === " ") flipNext();
            if (e.key === "ArrowLeft") flipPrev();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [flipNext, flipPrev]);

    /* ─── Fullscreen ─── */
    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false));
        }
    }, []);

    /* ─── Scrollbar ─── */
    const scrollbarProgress = totalPages > 0 ? currentPage / Math.max(1, totalPages - 1) : 0;

    const onScrollbarClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!pageFlipRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const targetPage = Math.round(x * (totalPages - 1));
            pageFlipRef.current.turnToPage(targetPage);
            setCurrentPage(targetPage);
            emitPageChange(targetPage, totalPages);
        },
        [totalPages]
    );

    /* ─── Thumbnail grid ─── */
    const goToPage = useCallback(
        (pageIndex: number) => {
            if (pageFlipRef.current) {
                pageFlipRef.current.turnToPage(pageIndex);
                setCurrentPage(pageIndex);
                emitPageChange(pageIndex, totalPages);
                setThumbnailMode(false);
            }
        },
        [totalPages]
    );

    /* ─── Error state ─── */
    if (error) {
        return (
            <div
                className="h-full w-full flex flex-col items-center justify-center gap-4"
                style={{ background: "#0b1120" }}
            >
                <p className="text-red-400 text-sm">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="text-white/50 hover:text-white text-xs underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    /* ─── Loading state ─── */
    if (!pdfReady) {
        return (
            <div
                className="h-full w-full flex flex-col items-center justify-center gap-6"
                style={{ background: "#0b1120" }}
            >
                {/* Hidden Document for loading the PDF */}
                <Document
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={(err) => setError(`Failed to load PDF: ${err.message}`)}
                    loading={null}
                >
                    {/* We don't render any Page here, just load the document */}
                </Document>

                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 relative">
                        <div className="absolute inset-0 border-2 border-indigo-500/20 rounded-full" />
                        <div className="absolute inset-0 border-2 border-transparent border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                    <p className="text-white/40 text-sm">Rendering pages… {loadingProgress}%</p>
                    <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500/60 rounded-full transition-all duration-300"
                            style={{ width: `${loadingProgress}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    /* ─── Thumbnail grid view ─── */
    if (thumbnailMode) {
        return (
            <div
                ref={containerRef}
                className="h-full w-full overflow-auto"
                style={{ background: "#0b1120" }}
            >
                {/* Close button */}
                <button
                    onClick={() => setThumbnailMode(false)}
                    className="fixed top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white rounded-full w-10 h-10 flex items-center justify-center backdrop-blur-sm transition-colors"
                >
                    ✕
                </button>

                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 p-6">
                    {pageImagesRef.current.map((src, i) => (
                        <button
                            key={i}
                            onClick={() => goToPage(i)}
                            className={`group relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${i === currentPage
                                    ? "border-indigo-500 shadow-lg shadow-indigo-500/20"
                                    : "border-white/10 hover:border-white/30"
                                }`}
                        >
                            <img
                                src={src}
                                alt={`Page ${i + 1}`}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent py-1">
                                <span className="text-white/80 text-xs">{i + 1}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    /* ─── Main flipbook view ─── */
    return (
        <div
            ref={containerRef}
            className="h-full w-full flex flex-col relative select-none"
            style={{
                background: `
                    linear-gradient(rgba(30,42,71,0.45) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(30,42,71,0.45) 1px, transparent 1px),
                    #0b1120
                `,
                backgroundSize: "120px 90px",
            }}
        >
            {/* ─── Toolbar (top-right) ─── */}
            <div className="absolute top-4 right-4 z-40 flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-xl px-2 py-1.5">
                <ToolbarBtn onClick={() => setThumbnailMode(true)} title="Page grid">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                    </svg>
                </ToolbarBtn>
                <ToolbarBtn onClick={toggleFullscreen} title="Fullscreen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                </ToolbarBtn>
                <ToolbarBtn onClick={onToggleSound} active={soundEnabled} title="Sound">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        {soundEnabled ? (
                            <>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </>
                        ) : (
                            <line x1="23" y1="9" x2="17" y2="15" />
                        )}
                    </svg>
                </ToolbarBtn>
            </div>

            {/* ─── Book container ─── */}
            <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
                <div
                    ref={bookRef}
                    className="relative"
                    style={{
                        maxWidth: "90vw",
                        maxHeight: "80vh",
                    }}
                />
            </div>

            {/* ─── Bottom bar ─── */}
            <div className="relative z-40 flex items-center gap-4 px-6 py-3">
                {/* Branding */}
                <span className="text-white/30 text-xs font-medium tracking-wider hidden sm:block" style={{ minWidth: 100 }}>
                    Bookmosphere
                </span>

                {/* Prev button */}
                <button
                    onClick={flipPrev}
                    disabled={currentPage <= 0}
                    className="text-white/50 hover:text-white disabled:opacity-20 transition-colors"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="11 17 6 12 11 7" />
                        <polyline points="18 17 13 12 18 7" />
                    </svg>
                </button>

                {/* Scrollbar */}
                <div
                    className="flex-1 h-2 bg-white/10 rounded-full cursor-pointer relative group"
                    onClick={onScrollbarClick}
                >
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white/60 rounded-full border-2 border-white/30 shadow-lg transition-all group-hover:scale-110"
                        style={{ left: `calc(${scrollbarProgress * 100}% - 10px)` }}
                    />
                </div>

                {/* Next button */}
                <button
                    onClick={flipNext}
                    disabled={currentPage >= totalPages - 1}
                    className="text-white/50 hover:text-white disabled:opacity-20 transition-colors"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="13 17 18 12 13 7" />
                        <polyline points="6 17 11 12 6 7" />
                    </svg>
                </button>

                {/* Page counter */}
                <span className="text-white/40 text-xs tabular-nums" style={{ minWidth: 60, textAlign: "right" }}>
                    {currentPage + 1} / {totalPages}
                </span>
            </div>
        </div>
    );
}

/* ─── Toolbar Button ─── */
function ToolbarBtn({
    onClick,
    active,
    title,
    children,
}: {
    onClick?: () => void;
    active?: boolean;
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-2 rounded-lg transition-colors ${active ? "text-white bg-white/10" : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
        >
            {children}
        </button>
    );
}
