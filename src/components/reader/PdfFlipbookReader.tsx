"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

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
   PdfFlipbookReader — Pixel-Perfect Heyzine Clone
   ═══════════════════════════════════════════════ */
export default function PdfFlipbookReader({
    pdfUrl,
    totalPages: totalPagesHint,
    initialPage = 1,
    onFlip,
    soundEnabled = true,
    onToggleSound,
}: PdfFlipbookReaderProps) {
    const [numPages, setNumPages] = useState(totalPagesHint);
    const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
    const [isFlipping, setIsFlipping] = useState(false);
    const [flipDir, setFlipDir] = useState<"next" | "prev">("next");
    const [loadError, setLoadError] = useState("");
    const [pdfLoaded, setPdfLoaded] = useState(false);

    // Feature toggles
    const [tocOpen, setTocOpen] = useState(false);
    const [zoomMode, setZoomMode] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [pdfOutline, setPdfOutline] = useState<any[]>([]);

    // Cover = page 1 displayed solo on the right side
    const isCover = currentPage === 1;
    const isLastSolo = !isCover && currentPage === numPages && numPages % 2 === 0;
    const leftPageNum = isCover ? null : currentPage;
    const rightPageNum = isCover ? 1 : isLastSolo ? null : (currentPage + 1 <= numPages ? currentPage + 1 : null);
    const showSpread = !isCover;

    /* ─── Responsive page dimensions ─── */
    const [pageDims, setPageDims] = useState({ w: 440, h: 620 });
    useEffect(() => {
        const update = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            // Pages should fill ~90% of viewport height
            const maxH = vh * 0.88;
            const maxW = vw * 0.38; // Each page max ~38% of viewport width
            // Use aspect ratio 0.707 (A4-like)
            const hFromW = maxW / 0.707;
            const h = Math.min(maxH, hFromW, 720);
            const w = h * 0.707;
            setPageDims({ w: Math.round(w), h: Math.round(h) });
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    /* ─── Load PDF ─── */
    const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
        setNumPages(n);
        setPdfLoaded(true);
        emitPageChange(currentPage - 1, n);
    }, [currentPage]);

    const onDocumentLoadError = useCallback((err: Error) => {
        console.error("PDF load error:", err);
        setLoadError("Failed to load PDF. Please try again.");
    }, []);

    /* ─── Try to extract PDF outline/bookmarks ─── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDocLoadForOutline = useCallback(async (pdf: any) => {
        try {
            const outline = await pdf.getOutline();
            if (outline && outline.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const items = outline.map((item: any, i: number) => ({
                    title: item.title || `Section ${i + 1}`,
                    dest: item.dest,
                    pageIndex: null as number | null,
                }));
                // Resolve destinations to page numbers
                for (const item of items) {
                    if (item.dest) {
                        try {
                            const ref = typeof item.dest === "string"
                                ? await pdf.getDestination(item.dest)
                                : item.dest;
                            if (ref && ref[0]) {
                                const idx = await pdf.getPageIndex(ref[0]);
                                item.pageIndex = idx;
                            }
                        } catch { /* ignore */ }
                    }
                }
                setPdfOutline(items);
            }
        } catch { /* no outline */ }
    }, []);

    /* ─── Navigation ─── */
    const FLIP_DURATION = 1000; // 1s matching video

    const goNext = useCallback(() => {
        if (isFlipping || !pdfLoaded) return;
        const step = isCover ? 1 : 2;
        const next = currentPage + step;
        if (next > numPages + 1) return;
        setFlipDir("next");
        setIsFlipping(true);
        onFlip?.();
        setTimeout(() => {
            setCurrentPage(Math.min(next, numPages));
            setIsFlipping(false);
            emitPageChange(Math.min(next, numPages) - 1, numPages);
        }, FLIP_DURATION);
    }, [isFlipping, pdfLoaded, currentPage, isCover, numPages, onFlip]);

    const goPrev = useCallback(() => {
        if (isFlipping || !pdfLoaded || currentPage <= 1) return;
        const prev = currentPage === 2 ? 1 : currentPage - 2;
        setFlipDir("prev");
        setIsFlipping(true);
        onFlip?.();
        setTimeout(() => {
            setCurrentPage(Math.max(1, prev));
            setIsFlipping(false);
            emitPageChange(Math.max(1, prev) - 1, numPages);
        }, FLIP_DURATION);
    }, [isFlipping, pdfLoaded, currentPage, numPages, onFlip]);

    const goToPage = useCallback((pageNum: number) => {
        if (isFlipping) return;
        // Snap to even page for spreads (except page 1)
        const target = pageNum <= 1 ? 1 : pageNum % 2 === 0 ? pageNum : pageNum - 1;
        setCurrentPage(target);
        emitPageChange(target - 1, numPages);
        setTocOpen(false);
    }, [isFlipping, numPages]);

    /* ─── Keyboard ─── */
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
            else if (e.key === "Escape") { setTocOpen(false); if (zoomMode) setZoomMode(false); }
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [goNext, goPrev, zoomMode]);

    /* ─── Touch/Swipe ─── */
    const touchX = useRef(0);
    const onTouchStart = (e: React.TouchEvent) => {
        if (zoomMode) return;
        touchX.current = e.touches[0].clientX;
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        if (zoomMode) return;
        const d = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(d) > 50) d > 0 ? goNext() : goPrev();
    };

    /* ─── Click nav (click left/right half of book) ─── */
    const onBookClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (zoomMode || isFlipping) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width * 0.35) goPrev();
        else if (x > rect.width * 0.65) goNext();
    };

    /* ─── Fullscreen ─── */
    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(() => { });
            setIsFullscreen(true);
        } else {
            document.exitFullscreen().catch(() => { });
            setIsFullscreen(false);
        }
    }, []);

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    /* ─── Zoom ─── */
    const zoomIn = () => setZoomLevel(z => Math.min(z + 0.3, 3));
    const zoomOut = () => {
        setZoomLevel(z => {
            const next = Math.max(z - 0.3, 1);
            if (next <= 1) { setPanOffset({ x: 0, y: 0 }); setZoomMode(false); }
            return next;
        });
    };
    const toggleZoom = () => {
        if (zoomMode) {
            setZoomMode(false);
            setZoomLevel(1);
            setPanOffset({ x: 0, y: 0 });
        } else {
            setZoomMode(true);
            setZoomLevel(1.5);
        }
    };

    /* ─── Panning in zoom mode ─── */
    const onPanMouseDown = (e: React.MouseEvent) => {
        if (!zoomMode || zoomLevel <= 1) return;
        setIsPanning(true);
        panStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    };
    const onPanMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        setPanOffset({
            x: e.clientX - panStart.current.x,
            y: e.clientY - panStart.current.y,
        });
    };
    const onPanMouseUp = () => setIsPanning(false);

    /* ─── Scrollbar ─── */
    const progress = numPages > 0 ? ((currentPage) / numPages) : 0;
    const scrollbarRef = useRef<HTMLDivElement>(null);
    const onScrollbarClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollbarRef.current) return;
        const rect = scrollbarRef.current.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const targetPage = Math.max(1, Math.round(pct * numPages));
        goToPage(targetPage);
    };

    /* ─── Error state ─── */
    if (loadError) {
        return (
            <div className="w-full h-full flex items-center justify-center" style={{ background: "#0b1120" }}>
                <p className="text-red-400 text-sm">{loadError}</p>
            </div>
        );
    }

    /* ═══════════════════════════════
       RENDER
       ═══════════════════════════════ */
    return (
        <div
            ref={containerRef}
            className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden select-none"
            style={{
                background: `
                    linear-gradient(rgba(30,42,71,0.45) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(30,42,71,0.45) 1px, transparent 1px)
                `,
                backgroundSize: "120px 90px",
                backgroundColor: "#0b1120",
            }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {/* Single Document wrapper — all Pages must be inside this */}
            <Document
                file={pdfUrl}
                onLoadSuccess={(pdf) => { onDocumentLoadSuccess(pdf); onDocLoadForOutline(pdf); }}
                onLoadError={onDocumentLoadError}
                loading={null}
            >

                {/* Loading spinner */}
                {!pdfLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "#0b1120" }}>
                        <div className="text-center space-y-3">
                            <div className="animate-spin w-10 h-10 border-3 border-gray-300 border-t-gray-600 rounded-full mx-auto" />
                            <p className="text-gray-500 text-sm">Loading PDF…</p>
                        </div>
                    </div>
                )}

                {/* ─── BOOK AREA ─── */}
                {pdfLoaded && (
                    <div
                        className="relative flex items-center justify-center flex-1 w-full"
                        style={{
                            cursor: zoomMode && zoomLevel > 1 ? (isPanning ? "grabbing" : "grab") : "default",
                        }}
                        onClick={!zoomMode ? onBookClick : undefined}
                        onMouseDown={zoomMode ? onPanMouseDown : undefined}
                        onMouseMove={zoomMode ? onPanMouseMove : undefined}
                        onMouseUp={zoomMode ? onPanMouseUp : undefined}
                        onMouseLeave={zoomMode ? onPanMouseUp : undefined}
                    >
                        <div
                            className="relative flex items-stretch"
                            style={{
                                perspective: "2500px",
                                transform: zoomMode ? `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)` : undefined,
                                transition: isPanning ? "none" : "transform 0.3s ease",
                            }}
                        >
                            {/* Stacked-page edge LEFT */}
                            {showSpread && (
                                <div className="absolute pointer-events-none" style={{
                                    left: "-6px", top: "6px", bottom: "6px", width: "7px",
                                    background: "linear-gradient(to left, #ccc 0px, #bbb 1px, #aaa 2px, #999 3px, transparent 7px)",
                                    borderRadius: "2px 0 0 2px",
                                }} />
                            )}

                            {/* Stacked-page edge RIGHT */}
                            <div className="absolute pointer-events-none" style={{
                                right: "-6px", top: "6px", bottom: "6px", width: "7px",
                                background: "linear-gradient(to right, #ccc 0px, #bbb 1px, #aaa 2px, #999 3px, transparent 7px)",
                                borderRadius: "0 2px 2px 0",
                            }} />

                            {/* COVER MODE: single page with white border */}
                            {isCover && (
                                <div style={{
                                    padding: "8px",
                                    background: "#fff",
                                    boxShadow: "2px 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)",
                                }}>
                                    <div className="relative overflow-hidden bg-white" style={{ width: pageDims.w, height: pageDims.h }}>
                                        <Page
                                            pageNumber={1}
                                            width={pageDims.w}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            loading={<PageLoader />}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* SPREAD MODE */}
                            {showSpread && (
                                <>
                                    {/* LEFT PAGE */}
                                    <div className="relative overflow-hidden bg-white" style={{
                                        width: pageDims.w, height: pageDims.h,
                                        boxShadow: "inset -4px 0 12px rgba(0,0,0,0.04)",
                                    }}>
                                        {leftPageNum && (
                                            <Page
                                                pageNumber={leftPageNum}
                                                width={pageDims.w}
                                                renderTextLayer={false}
                                                renderAnnotationLayer={false}
                                                loading={<PageLoader />}
                                            />
                                        )}
                                    </div>

                                    {/* CENTER SPINE */}
                                    <div className="relative z-10" style={{
                                        width: "3px",
                                        background: "linear-gradient(to right, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.08) 100%)",
                                    }} />

                                    {/* RIGHT PAGE */}
                                    <div className="relative overflow-hidden bg-white" style={{
                                        width: pageDims.w, height: pageDims.h,
                                        boxShadow: "inset 4px 0 12px rgba(0,0,0,0.04)",
                                    }}>
                                        {rightPageNum ? (
                                            <Page
                                                pageNumber={rightPageNum}
                                                width={pageDims.w}
                                                renderTextLayer={false}
                                                renderAnnotationLayer={false}
                                                loading={<PageLoader />}
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-white" />
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Page flip animation overlay */}
                            {isFlipping && (
                                <FlipOverlay
                                    direction={flipDir}
                                    isCover={isCover}
                                    width={pageDims.w}
                                    height={pageDims.h}
                                    duration={FLIP_DURATION}
                                />
                            )}
                        </div>
                    </div>
                )}

            </Document>

            {/* ═══ TOOLBAR (top-right) ═══ */}
            <div className="absolute top-4 right-4 z-30 flex items-center gap-1 bg-white rounded-lg shadow-md px-1 py-1" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                {/* TOC / Grid */}
                <ToolbarBtn
                    onClick={() => setTocOpen(!tocOpen)}
                    active={tocOpen}
                    title="Table of contents"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="3" width="8" height="8" rx="1" />
                        <rect x="13" y="3" width="8" height="8" rx="1" />
                        <rect x="3" y="13" width="8" height="8" rx="1" />
                        <rect x="13" y="13" width="8" height="8" rx="1" />
                    </svg>
                </ToolbarBtn>

                {/* Zoom */}
                <ToolbarBtn
                    onClick={toggleZoom}
                    active={zoomMode}
                    title={zoomMode ? "Exit zoom" : "Zoom in"}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        {!zoomMode && (
                            <>
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </>
                        )}
                        {zoomMode && (
                            <line x1="8" y1="11" x2="14" y2="11" />
                        )}
                    </svg>
                </ToolbarBtn>

                {/* Fullscreen */}
                <ToolbarBtn
                    onClick={toggleFullscreen}
                    active={isFullscreen}
                    title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        {!isFullscreen ? (
                            <>
                                <polyline points="15 3 21 3 21 9" />
                                <polyline points="9 21 3 21 3 15" />
                                <polyline points="21 15 21 21 15 21" />
                                <polyline points="3 9 3 3 9 3" />
                            </>
                        ) : (
                            <>
                                <polyline points="4 14 10 14 10 20" />
                                <polyline points="20 10 14 10 14 4" />
                                <polyline points="14 20 14 14 20 14" />
                                <polyline points="10 4 10 10 4 10" />
                            </>
                        )}
                    </svg>
                </ToolbarBtn>

                {/* Sound */}
                <ToolbarBtn
                    onClick={onToggleSound}
                    active={soundEnabled}
                    title={soundEnabled ? "Mute" : "Unmute"}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        {soundEnabled ? (
                            <>
                                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            </>
                        ) : (
                            <>
                                <line x1="23" y1="9" x2="17" y2="15" />
                                <line x1="17" y1="9" x2="23" y2="15" />
                            </>
                        )}
                    </svg>
                </ToolbarBtn>
            </div>

            {/* ═══ ZOOM +/- CONTROLS ═══ */}
            {zoomMode && (
                <div className="absolute top-24 right-4 z-30 flex flex-col gap-1">
                    <button onClick={zoomIn} className="w-9 h-9 bg-white rounded shadow flex items-center justify-center text-gray-600 hover:text-black hover:shadow-md transition-all" title="Zoom in">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                    <button onClick={zoomOut} className="w-9 h-9 bg-white rounded shadow flex items-center justify-center text-gray-600 hover:text-black hover:shadow-md transition-all" title="Zoom out">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                </div>
            )}

            {/* ═══ TABLE OF CONTENTS PANEL ═══ */}
            {tocOpen && (
                <div className="absolute top-0 right-0 bottom-0 z-40 w-64 bg-white shadow-xl flex flex-col" style={{ boxShadow: "-4px 0 16px rgba(0,0,0,0.1)" }}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-800">Contents</h3>
                        <button onClick={() => setTocOpen(false)} className="text-gray-400 hover:text-gray-700 transition-colors" title="Close">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto py-2">
                        {pdfOutline.length > 0 ? (
                            pdfOutline.map((item, i) => (
                                <button
                                    key={i}
                                    onClick={() => item.pageIndex != null && goToPage(item.pageIndex + 1)}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors truncate"
                                >
                                    {item.title}
                                </button>
                            ))
                        ) : (
                            // Fallback: list page numbers
                            Array.from({ length: Math.ceil(numPages / 10) }, (_, i) => {
                                const page = i * 10 + 1;
                                return (
                                    <button
                                        key={page}
                                        onClick={() => goToPage(page)}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                    >
                                        Page {page}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* ═══ BOTTOM BAR ═══ */}
            <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3">
                {/* Back arrow */}
                <button
                    onClick={goPrev}
                    disabled={currentPage <= 1}
                    className="text-gray-400 hover:text-white disabled:opacity-0 transition-all"
                    aria-label="Previous page"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 17l-5-5 5-5" />
                        <path d="M18 17l-5-5 5-5" />
                    </svg>
                </button>

                {/* Scrollbar / Progress */}
                <div
                    ref={scrollbarRef}
                    onClick={onScrollbarClick}
                    className="flex-1 mx-6 h-2 rounded-full cursor-pointer relative"
                    style={{ background: "rgba(255,255,255,0.12)", maxWidth: "600px", margin: "0 auto" }}
                >
                    <div
                        className="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-300"
                        style={{
                            width: `${Math.max(8, progress * 100)}%`,
                            background: "rgba(255,255,255,0.3)",
                        }}
                    />
                    {/* Thumb */}
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white/60 shadow-sm transition-all duration-300"
                        style={{ left: `calc(${progress * 100}% - 8px)` }}
                    />
                </div>

                {/* Forward arrow */}
                <button
                    onClick={goNext}
                    disabled={currentPage >= numPages}
                    className="text-gray-400 hover:text-white disabled:opacity-0 transition-all"
                    aria-label="Next page"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 7l5 5-5 5" />
                        <path d="M6 7l5 5-5 5" />
                    </svg>
                </button>
            </div>

            {/* ═══ BRANDING (bottom-left) ═══ */}
            <div className="absolute bottom-12 left-4 z-20 flex items-center gap-2 opacity-40">
                <span className="text-[11px] text-gray-300 font-medium tracking-wide">Bookmosphere</span>
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
            className={`w-9 h-9 flex items-center justify-center rounded-md transition-all ${active ? "text-gray-900 bg-gray-100" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
        >
            {children}
        </button>
    );
}

/* ─── Page Loader ─── */
function PageLoader() {
    return (
        <div className="w-full h-full flex items-center justify-center bg-white">
            <div className="animate-spin w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full" />
        </div>
    );
}

/* ─── Realistic Page Curl Overlay ─── */
function FlipOverlay({
    direction,
    isCover,
    width,
    height,
    duration,
}: {
    direction: "next" | "prev";
    isCover: boolean;
    width: number;
    height: number;
    duration: number;
}) {
    const isNext = direction === "next";
    const id = `curl_${Date.now()}`;

    /*
     * The realistic curl works by:
     * 1. A main page that rotates around its left edge (like a book hinge)
     * 2. A "curl" strip on the leading edge that creates the bend illusion
     * 3. A shadow that sweeps across the page underneath
     * 4. A highlight gradient on the curling page for the paper sheen
     */
    return (
        <div className="absolute inset-0 pointer-events-none z-30" style={{ perspective: "1800px" }}>
            {/* Main flipping page body */}
            <div
                className={`${id}_page`}
                style={{
                    position: "absolute",
                    width,
                    height,
                    top: 0,
                    ...(isNext
                        ? { right: isCover ? 0 : "50%", transformOrigin: "left center" }
                        : { left: "50%", transformOrigin: "right center" }),
                    background: "linear-gradient(90deg, #f5f3ef 0%, #fff 20%, #fdfcfb 80%, #f0ede8 100%)",
                    borderRadius: "0 2px 2px 0",
                    animation: `${id}_flip ${duration}ms cubic-bezier(0.645, 0.045, 0.355, 1.0) forwards`,
                    backfaceVisibility: "hidden",
                    zIndex: 5,
                }}
            >
                {/* Paper texture gradient on the flipping page */}
                <div style={{
                    position: "absolute", inset: 0,
                    background: isNext
                        ? "linear-gradient(to left, rgba(0,0,0,0.06) 0%, transparent 15%, transparent 85%, rgba(0,0,0,0.02) 100%)"
                        : "linear-gradient(to right, rgba(0,0,0,0.06) 0%, transparent 15%, transparent 85%, rgba(0,0,0,0.02) 100%)",
                }} />
            </div>

            {/* Curl edge — the curved strip that creates the bend illusion */}
            <div
                className={`${id}_curl`}
                style={{
                    position: "absolute",
                    width: width * 0.12,
                    height,
                    top: 0,
                    ...(isNext
                        ? { right: isCover ? 0 : "50%", transformOrigin: "left center" }
                        : { left: "50%", transformOrigin: "right center" }),
                    background: isNext
                        ? "linear-gradient(to left, rgba(255,255,255,0.9) 0%, rgba(245,243,239,0.7) 40%, rgba(0,0,0,0.08) 100%)"
                        : "linear-gradient(to right, rgba(255,255,255,0.9) 0%, rgba(245,243,239,0.7) 40%, rgba(0,0,0,0.08) 100%)",
                    animation: `${id}_curlEdge ${duration}ms cubic-bezier(0.645, 0.045, 0.355, 1.0) forwards`,
                    zIndex: 6,
                }}
            />

            {/* Shadow cast on the page underneath (sweeps across) */}
            <div
                className={`${id}_shadow`}
                style={{
                    position: "absolute",
                    width: width * 0.5,
                    height,
                    top: 0,
                    ...(isNext
                        ? { right: isCover ? 0 : "50%" }
                        : { left: "50%" }),
                    background: isNext
                        ? "linear-gradient(to right, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.08) 30%, transparent 100%)"
                        : "linear-gradient(to left, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.08) 30%, transparent 100%)",
                    animation: `${id}_shadowSweep ${duration}ms cubic-bezier(0.645, 0.045, 0.355, 1.0) forwards`,
                    zIndex: 4,
                }}
            />

            {/* Spine shadow intensification during flip */}
            <div style={{
                position: "absolute",
                width: 6,
                height,
                top: 0,
                left: "50%",
                marginLeft: -3,
                background: "rgba(0,0,0,0.12)",
                opacity: 0,
                animation: `${id}_spineGlow ${duration}ms ease-in-out`,
                zIndex: 7,
            }} />

            <style>{`
                @keyframes ${id}_flip {
                    0%   { transform: rotateY(0deg);     box-shadow: -2px 0 5px rgba(0,0,0,0.05); }
                    15%  { transform: rotateY(${isNext ? "-15" : "15"}deg);  box-shadow: ${isNext ? "-" : ""}5px 0 15px rgba(0,0,0,0.12); }
                    35%  { transform: rotateY(${isNext ? "-55" : "55"}deg);  box-shadow: ${isNext ? "-" : ""}10px 0 25px rgba(0,0,0,0.2); }
                    55%  { transform: rotateY(${isNext ? "-100" : "100"}deg); box-shadow: ${isNext ? "-" : ""}12px 0 35px rgba(0,0,0,0.22); }
                    75%  { transform: rotateY(${isNext ? "-145" : "145"}deg); box-shadow: ${isNext ? "-" : ""}8px 0 20px rgba(0,0,0,0.15); }
                    90%  { transform: rotateY(${isNext ? "-170" : "170"}deg); box-shadow: ${isNext ? "-" : ""}3px 0 8px rgba(0,0,0,0.06); }
                    100% { transform: rotateY(${isNext ? "-180" : "180"}deg); box-shadow: 0 0 0 rgba(0,0,0,0); }
                }
                @keyframes ${id}_curlEdge {
                    0%   { transform: rotateY(0deg) scaleX(1);    opacity: 0; }
                    10%  { opacity: 1; }
                    15%  { transform: rotateY(${isNext ? "-15" : "15"}deg) scaleX(1.8);  }
                    35%  { transform: rotateY(${isNext ? "-55" : "55"}deg) scaleX(2.2);  }
                    55%  { transform: rotateY(${isNext ? "-100" : "100"}deg) scaleX(1.5); }
                    75%  { transform: rotateY(${isNext ? "-145" : "145"}deg) scaleX(0.8); }
                    90%  { transform: rotateY(${isNext ? "-170" : "170"}deg) scaleX(0.3); opacity: 0.5; }
                    100% { transform: rotateY(${isNext ? "-180" : "180"}deg) scaleX(0);   opacity: 0; }
                }
                @keyframes ${id}_shadowSweep {
                    0%   { opacity: 0; transform: translateX(0); }
                    15%  { opacity: 0.4; }
                    35%  { opacity: 0.8; transform: translateX(${isNext ? "-" : ""}${width * 0.15}px); }
                    55%  { opacity: 0.6; transform: translateX(${isNext ? "-" : ""}${width * 0.35}px); }
                    75%  { opacity: 0.3; transform: translateX(${isNext ? "-" : ""}${width * 0.6}px); }
                    100% { opacity: 0;   transform: translateX(${isNext ? "-" : ""}${width * 0.8}px); }
                }
                @keyframes ${id}_spineGlow {
                    0%   { opacity: 0; }
                    30%  { opacity: 1; }
                    70%  { opacity: 1; }
                    100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
