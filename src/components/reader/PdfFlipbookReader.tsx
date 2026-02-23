"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";

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

type PageCache = Map<number, HTMLCanvasElement>;

/* ─── Render a single PDF page to canvas ─── */
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
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        await page.render({ canvasContext: ctx, viewport }).promise;
        cache.set(pageNum, canvas);
        return canvas;
    } catch (err) {
        console.warn(`Failed to render page ${pageNum}:`, err);
        return null;
    }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
    const [isFlipping, setIsFlipping] = useState(false);
    const [flipDir, setFlipDir] = useState<"next" | "prev">("next");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const cacheRef = useRef<PageCache>(new Map());

    const numPages = pdfDoc?.numPages || totalPagesHint;

    // Cover = page 1 displayed solo on the right side
    const isCover = currentPage === 1;
    const leftPageNum = isCover ? null : currentPage;
    const rightPageNum = isCover ? 1 : (currentPage + 1 <= numPages ? currentPage + 1 : null);

    /* ─── Responsive scale ─── */
    const [scale, setScale] = useState(1.5);
    useEffect(() => {
        const update = () => {
            const w = window.innerWidth;
            if (w < 768) setScale(0.7);
            else if (w < 1024) setScale(1.0);
            else if (w < 1440) setScale(1.3);
            else setScale(1.5);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    /* ─── Load PDF via pdfjs-dist (browser-side) ─── */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
                const doc = await pdfjsLib.getDocument(pdfUrl).promise;
                if (!cancelled) {
                    setPdfDoc(doc);
                    setLoading(false);
                    emitPageChange(initialPage - 1, doc.numPages);
                }
            } catch (err) {
                console.error("PDF load failed:", err);
                if (!cancelled) { setError("Failed to load PDF"); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [pdfUrl]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ─── Pre-render visible + adjacent pages ─── */
    useEffect(() => {
        if (!pdfDoc) return;
        const toRender = new Set<number>();
        if (leftPageNum) toRender.add(leftPageNum);
        if (rightPageNum) toRender.add(rightPageNum);
        // prefetch next 2
        const nextStart = isCover ? 2 : currentPage + 2;
        for (let i = nextStart; i <= Math.min(nextStart + 1, numPages); i++) toRender.add(i);
        toRender.forEach((n) => renderPdfPage(pdfDoc, n, cacheRef.current, scale));
    }, [pdfDoc, currentPage, scale, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ─── Navigation ─── */
    const goNext = useCallback(() => {
        if (isFlipping || !pdfDoc) return;
        const step = isCover ? 1 : 2; // cover → open to page 2-3; spread → skip 2
        const next = currentPage + step;
        if (next > numPages) return;
        setFlipDir("next");
        setIsFlipping(true);
        onFlip?.();
        setTimeout(() => {
            setCurrentPage(next);
            setIsFlipping(false);
            emitPageChange(next - 1, numPages);
        }, 600);
    }, [isFlipping, pdfDoc, currentPage, isCover, numPages, onFlip]);

    const goPrev = useCallback(() => {
        if (isFlipping || !pdfDoc || currentPage <= 1) return;
        const prev = currentPage === 2 ? 1 : currentPage - 2;
        setFlipDir("prev");
        setIsFlipping(true);
        onFlip?.();
        setTimeout(() => {
            setCurrentPage(prev);
            setIsFlipping(false);
            emitPageChange(prev - 1, numPages);
        }, 600);
    }, [isFlipping, pdfDoc, currentPage, numPages, onFlip]);

    /* ─── Keyboard + touch ─── */
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [goNext, goPrev]);

    const touchX = useRef(0);
    const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
    const onTouchEnd = (e: React.TouchEvent) => {
        const d = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(d) > 50) d > 0 ? goNext() : goPrev();
    };

    /* ─── Loading / Error ─── */
    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center" style={{ background: "radial-gradient(ellipse at center, #2a2520 0%, #1a1510 70%, #0f0d0a 100%)" }}>
                <div className="text-center space-y-3">
                    <div className="animate-spin w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full mx-auto" />
                    <p className="text-amber-200/60 text-sm">Loading PDF…</p>
                </div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center" style={{ background: "radial-gradient(ellipse at center, #2a2520 0%, #1a1510 70%, #0f0d0a 100%)" }}>
                <p className="text-red-400 text-sm">{error}</p>
            </div>
        );
    }

    /* ─── Page dimensions ─── */
    const pw = "min(440px, 42vw)";
    const ph = "min(620px, 80vh)";

    /* ─── Render ─── */
    return (
        <div
            className="w-full h-full flex items-center justify-center relative overflow-hidden select-none"
            style={{ background: "radial-gradient(ellipse at center, #2a2520 0%, #1a1510 70%, #0f0d0a 100%)" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(255,220,150,0.03) 0%, transparent 60%)" }} />

            {/* ─── Book ─── */}
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
                    <div className="relative overflow-hidden bg-white" style={{ width: pw, height: ph, boxShadow: "inset -3px 0 10px rgba(0,0,0,0.06)" }}>
                        {leftPageNum && <CanvasPage pdfDoc={pdfDoc} pageNum={leftPageNum} cache={cacheRef.current} scale={scale} />}
                    </div>
                )}

                {/* SPINE */}
                {!isCover && (
                    <div className="relative z-10" style={{ width: "5px", background: "linear-gradient(to right, #3d3530, #2a2420, #3d3530)", boxShadow: "inset 0 0 4px rgba(0,0,0,0.4), 0 0 8px rgba(255,220,150,0.08)" }} />
                )}

                {/* RIGHT PAGE */}
                <div className="relative overflow-hidden bg-white" style={{ width: pw, height: ph, boxShadow: isCover ? "4px 6px 24px rgba(0,0,0,0.35), -2px 0 10px rgba(0,0,0,0.08)" : "inset 3px 0 10px rgba(0,0,0,0.06)" }}>
                    {rightPageNum ? (
                        <CanvasPage pdfDoc={pdfDoc} pageNum={rightPageNum} cache={cacheRef.current} scale={scale} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-amber-200/40 text-sm italic">End of book</div>
                    )}
                </div>

                {/* ─── Flip animation overlay ─── */}
                {isFlipping && <FlipOverlay direction={flipDir} isCover={isCover} width={pw} height={ph} />}
            </div>

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

/* ═══════════════════════════════════════
   CanvasPage — renders a single PDF page
   ═══════════════════════════════════════ */
function CanvasPage({
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
    const divRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setReady(false);

        (async () => {
            try {
                if (!pdfDoc || !divRef.current) return;
                const srcCanvas = await renderPdfPage(pdfDoc, pageNum, cache, scale);
                if (cancelled || !divRef.current) return;

                // Clear any existing children
                while (divRef.current.firstChild) {
                    divRef.current.removeChild(divRef.current.firstChild);
                }

                if (srcCanvas) {
                    const c = document.createElement("canvas");
                    c.width = srcCanvas.width;
                    c.height = srcCanvas.height;
                    c.style.width = "100%";
                    c.style.height = "100%";
                    c.style.objectFit = "contain";
                    c.style.display = "block";
                    const ctx = c.getContext("2d");
                    if (ctx) {
                        ctx.drawImage(srcCanvas, 0, 0);
                    }
                    if (!cancelled && divRef.current) {
                        divRef.current.appendChild(c);
                    }
                }
                setReady(true);
            } catch (err) {
                console.error(`CanvasPage error for page ${pageNum}:`, err);
                setReady(true); // Still mark as ready to avoid infinite spinner
            }
        })();

        return () => { cancelled = true; };
    }, [pdfDoc, pageNum, scale]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div ref={divRef} className="w-full h-full flex items-center justify-center bg-white">
            {!ready && <div className="animate-spin w-6 h-6 border-2 border-amber-500/20 border-t-amber-500/60 rounded-full" />}
        </div>
    );
}

/* ═══════════════════════════════════════
   FlipOverlay — CSS 3D page turn
   ═══════════════════════════════════════ */
function FlipOverlay({ direction, isCover, width, height }: { direction: "next" | "prev"; isCover: boolean; width: string; height: string }) {
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
                        ? { right: isCover ? "0" : "50%", transformOrigin: isCover ? "left center" : "right center" }
                        : { left: "50%", transformOrigin: "left center" }),
                    background: "linear-gradient(to right, #f5f2ee, #fff)",
                    boxShadow: "0 0 40px rgba(0,0,0,0.25)",
                    animation: `${isNext ? "flipPageNext" : "flipPagePrev"} 0.6s ease-in-out forwards`,
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
