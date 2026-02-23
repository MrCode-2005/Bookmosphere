"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure the worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/* ─── Emit page change to header/footer ─── */
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
}

/* ═══════════════════════════════════════
   PdfFlipbookReader — Heyzine-style
   ═══════════════════════════════════════ */
export default function PdfFlipbookReader({
    pdfUrl,
    totalPages: totalPagesHint,
    initialPage = 1,
    onFlip,
}: PdfFlipbookReaderProps) {
    const [numPages, setNumPages] = useState(totalPagesHint);
    const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
    const [isFlipping, setIsFlipping] = useState(false);
    const [flipDir, setFlipDir] = useState<"next" | "prev">("next");
    const [loadError, setLoadError] = useState("");
    const [pdfLoaded, setPdfLoaded] = useState(false);

    // Cover = page 1 displayed solo on the right side
    const isCover = currentPage === 1;
    const leftPageNum = isCover ? null : currentPage;
    const rightPageNum = isCover ? 1 : (currentPage + 1 <= numPages ? currentPage + 1 : null);

    // Responsive page dimensions
    const [pageDims, setPageDims] = useState({ w: 440, h: 620 });
    useEffect(() => {
        const update = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const w = Math.min(440, vw * 0.42);
            const h = Math.min(620, vh * 0.78);
            setPageDims({ w, h });
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    // PDF loaded callback
    const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
        setNumPages(n);
        setPdfLoaded(true);
        emitPageChange(currentPage - 1, n);
    }, [currentPage]);

    const onDocumentLoadError = useCallback((err: Error) => {
        console.error("PDF load error:", err);
        setLoadError("Failed to load PDF. Please try again.");
    }, []);

    /* ─── Navigation ─── */
    const goNext = useCallback(() => {
        if (isFlipping) return;
        const step = isCover ? 1 : 2;
        const next = currentPage + step;
        if (next > numPages) return;
        setFlipDir("next");
        setIsFlipping(true);
        onFlip?.();
        setTimeout(() => {
            setCurrentPage(next);
            setIsFlipping(false);
            emitPageChange(next - 1, numPages);
        }, 500);
    }, [isFlipping, currentPage, isCover, numPages, onFlip]);

    const goPrev = useCallback(() => {
        if (isFlipping || currentPage <= 1) return;
        const prev = currentPage === 2 ? 1 : currentPage - 2;
        setFlipDir("prev");
        setIsFlipping(true);
        onFlip?.();
        setTimeout(() => {
            setCurrentPage(prev);
            setIsFlipping(false);
            emitPageChange(prev - 1, numPages);
        }, 500);
    }, [isFlipping, currentPage, numPages, onFlip]);

    /* ─── Keyboard ─── */
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [goNext, goPrev]);

    /* ─── Touch/Swipe ─── */
    const touchX = useRef(0);
    const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
    const onTouchEnd = (e: React.TouchEvent) => {
        const d = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(d) > 50) d > 0 ? goNext() : goPrev();
    };

    /* ─── Error state ─── */
    if (loadError) {
        return (
            <div className="w-full h-full flex items-center justify-center" style={{ background: "radial-gradient(ellipse at center, #2a2520 0%, #1a1510 70%, #0f0d0a 100%)" }}>
                <p className="text-red-400 text-sm">{loadError}</p>
            </div>
        );
    }

    return (
        <div
            className="w-full h-full flex items-center justify-center relative overflow-hidden select-none"
            style={{ background: "radial-gradient(ellipse at center, #2a2520 0%, #1a1510 70%, #0f0d0a 100%)" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(255,220,150,0.03) 0%, transparent 60%)" }} />

            {/* Hidden PDF Document — react-pdf handles loading */}
            <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
                className="hidden"
            >
                {/* Pages are rendered inside the Document context */}
            </Document>

            {/* Loading overlay */}
            {!pdfLoaded && (
                <div className="absolute inset-0 flex items-center justify-center z-50">
                    <div className="text-center space-y-3">
                        <div className="animate-spin w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full mx-auto" />
                        <p className="text-amber-200/60 text-sm">Loading PDF…</p>
                    </div>
                </div>
            )}

            {/* ─── Book ─── */}
            {pdfLoaded && (
                <div className="relative flex items-stretch" style={{ perspective: "2500px" }}>
                    {/* Shadow under book */}
                    <div className="absolute -inset-4 rounded-lg pointer-events-none" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 8px 20px rgba(0,0,0,0.4)" }} />

                    {/* Stacked-page edge left */}
                    {!isCover && (
                        <div className="absolute pointer-events-none" style={{ left: "-5px", top: "4px", bottom: "4px", width: "6px", background: "linear-gradient(to left, #d4cfc8 0px, #c0bab2 1px, #b0a99f 2px, transparent 6px)", borderRadius: "2px 0 0 2px" }} />
                    )}
                    {/* Stacked-page edge right */}
                    <div className="absolute pointer-events-none" style={{ right: "-5px", top: "4px", bottom: "4px", width: "6px", background: "linear-gradient(to right, #d4cfc8 0px, #c0bab2 1px, #b0a99f 2px, transparent 6px)", borderRadius: "0 2px 2px 0" }} />

                    {/* LEFT PAGE */}
                    {!isCover && (
                        <div
                            className="relative overflow-hidden bg-white"
                            style={{ width: pageDims.w, height: pageDims.h, boxShadow: "inset -3px 0 10px rgba(0,0,0,0.06)" }}
                        >
                            {leftPageNum && (
                                <Document file={pdfUrl} loading={null}>
                                    <Page
                                        pageNumber={leftPageNum}
                                        width={pageDims.w}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        loading={<PageLoader />}
                                    />
                                </Document>
                            )}
                        </div>
                    )}

                    {/* SPINE */}
                    {!isCover && (
                        <div className="relative z-10" style={{ width: "5px", background: "linear-gradient(to right, #3d3530, #2a2420, #3d3530)", boxShadow: "inset 0 0 4px rgba(0,0,0,0.4), 0 0 8px rgba(255,220,150,0.08)" }} />
                    )}

                    {/* RIGHT PAGE */}
                    <div
                        className="relative overflow-hidden bg-white"
                        style={{
                            width: pageDims.w,
                            height: pageDims.h,
                            boxShadow: isCover
                                ? "4px 6px 24px rgba(0,0,0,0.35), -2px 0 10px rgba(0,0,0,0.08)"
                                : "inset 3px 0 10px rgba(0,0,0,0.06)",
                        }}
                    >
                        {rightPageNum ? (
                            <Document file={pdfUrl} loading={null}>
                                <Page
                                    pageNumber={rightPageNum}
                                    width={pageDims.w}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                    loading={<PageLoader />}
                                />
                            </Document>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-amber-200/40 text-sm italic">End of book</div>
                        )}
                    </div>

                    {/* Flip animation overlay */}
                    {isFlipping && <FlipOverlay direction={flipDir} isCover={isCover} width={pageDims.w} height={pageDims.h} />}
                </div>
            )}

            {/* ─── Nav arrows ─── */}
            <button onClick={goPrev} disabled={currentPage <= 1} className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white disabled:opacity-0 transition-all z-20" aria-label="Previous page">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button onClick={goNext} disabled={!rightPageNum && !isCover} className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white disabled:opacity-0 transition-all z-20" aria-label="Next page">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>

            {/* ─── Hint ─── */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/20 z-20">
                ← → to navigate · Space for next
            </div>
        </div>
    );
}

/* ─── Page Loader ─── */
function PageLoader() {
    return (
        <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-amber-500/20 border-t-amber-500/60 rounded-full" />
        </div>
    );
}

/* ─── Flip Overlay ─── */
function FlipOverlay({ direction, isCover, width, height }: { direction: "next" | "prev"; isCover: boolean; width: number; height: number }) {
    const isNext = direction === "next";
    return (
        <div className="absolute inset-0 pointer-events-none z-30" style={{ perspective: "2500px" }}>
            <div
                style={{
                    position: "absolute",
                    width,
                    height,
                    top: 0,
                    ...(isNext
                        ? { right: isCover ? 0 : "50%", transformOrigin: isCover ? "left center" : "right center" }
                        : { left: "50%", transformOrigin: "left center" }),
                    background: "linear-gradient(to right, #f5f2ee, #fff)",
                    boxShadow: "0 0 40px rgba(0,0,0,0.25)",
                    animation: `${isNext ? "flipPageNext" : "flipPagePrev"} 0.5s ease-in-out forwards`,
                    backfaceVisibility: "hidden",
                }}
            />
            <style>{`
                @keyframes flipPageNext {
                    0% { transform: rotateY(0deg); }
                    100% { transform: rotateY(-180deg); }
                }
                @keyframes flipPagePrev {
                    0% { transform: rotateY(-180deg); }
                    100% { transform: rotateY(0deg); }
                }
            `}</style>
        </div>
    );
}
