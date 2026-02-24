"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PageFlip, FlipCorner } from "@/lib/page-flip";
import "@/lib/page-flip/Style/stPageFlip.css";
import { getFullCache, cachePage, finalizeCacheMeta } from "@/lib/page-cache";

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

/* ─── Render a single PDF page to JPEG blob ─── */
async function renderPageToBlob(doc: any, pageNum: number, scale: number): Promise<Blob> {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error(`toBlob failed p${pageNum}`))),
            "image/jpeg",
            0.97
        );
    });
}

/* ─── Create tiny white placeholder data URL ─── */
const PLACEHOLDER_URL = (() => {
    if (typeof document === "undefined") return "";
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 3;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 2, 3);
    return c.toDataURL("image/jpeg", 0.5);
})();

/* ─── Types ─── */
interface PdfFlipbookReaderProps {
    bookId: string;
    pdfUrl: string;
    totalPages: number;
    initialPage?: number;
    onFlip?: () => void;
    soundEnabled?: boolean;
    onToggleSound?: () => void;
}

const RENDER_CONCURRENCY = 12;
const RENDER_SCALE = 2; // DPR-aware canvas handles Retina

/* ═══════════════════════════════════════════════
 *    PdfFlipbookReader — Progressive Loading
 *    Shows book instantly, renders in background
 * ═══════════════════════════════════════════════ */
export default function PdfFlipbookReader({
    bookId,
    pdfUrl,
    totalPages: totalPagesHint,
    initialPage = 1,
    onFlip,
    soundEnabled = true,
    onToggleSound,
}: PdfFlipbookReaderProps) {
    const [totalPages, setTotalPages] = useState(totalPagesHint || 0);
    const [currentPage, setCurrentPage] = useState(0);
    const [pdfReady, setPdfReady] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState("Loading…");
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [thumbnailMode, setThumbnailMode] = useState(false);
    const [bgProgress, setBgProgress] = useState(100); // background render progress

    const containerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<HTMLDivElement>(null);
    const pageFlipRef = useRef<PageFlip | null>(null);
    const pageImageUrlsRef = useRef<string[]>([]);
    const objectUrlsRef = useRef<string[]>([]);

    const PAGE_WIDTH = 550;
    const PAGE_HEIGHT = 733;

    /* ─── MAIN LOADING LOGIC ─── */
    useEffect(() => {
        if (pdfReady || !pdfUrl) return;
        let cancelled = false;

        async function loadPages() {
            try {
                /* ── 1. Try cache first ── */
                setLoadingMessage("Checking cache…");
                setLoadingProgress(5);

                const hintCount = totalPagesHint || 0;
                if (hintCount > 0) {
                    const cached = await getFullCache(bookId, hintCount);
                    if (cached && !cancelled) {
                        setLoadingMessage("Loading from cache…");
                        setLoadingProgress(100);
                        pageImageUrlsRef.current = cached;
                        objectUrlsRef.current = cached;
                        setTotalPages(hintCount);
                        setPdfReady(true);
                        return;
                    }
                }

                /* ── 2. Load PDF ── */
                setLoadingMessage("Loading PDF…");
                setLoadingProgress(10);

                const doc = await pdfjs.getDocument({
                    url: pdfUrl,
                    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
                    cMapPacked: true,
                    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
                    isEvalSupported: false,
                } as any).promise;

                if (cancelled) return;
                const pageCount = doc.numPages;
                if (pageCount === 0) { setError("PDF has no pages"); return; }
                setTotalPages(pageCount);

                /* ── 3. Render first 6 pages quickly ── */
                setLoadingMessage("Preparing pages…");
                setLoadingProgress(20);

                const INITIAL_PAGES = Math.min(6, pageCount);
                const initialUrls: string[] = [];
                const initialObjUrls: string[] = [];

                // Render initial pages in parallel
                const initialBlobs = await Promise.all(
                    Array.from({ length: INITIAL_PAGES }, (_, i) =>
                        renderPageToBlob(doc, i + 1, RENDER_SCALE).catch(() => {
                            // White fallback
                            const c = document.createElement("canvas");
                            c.width = PAGE_WIDTH * RENDER_SCALE;
                            c.height = PAGE_HEIGHT * RENDER_SCALE;
                            const ctx = c.getContext("2d")!;
                            ctx.fillStyle = "#fff";
                            ctx.fillRect(0, 0, c.width, c.height);
                            return new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
                        })
                    )
                );

                if (cancelled) return;

                for (let i = 0; i < initialBlobs.length; i++) {
                    cachePage(bookId, i, initialBlobs[i]);
                    const url = URL.createObjectURL(initialBlobs[i]);
                    initialUrls.push(url);
                    initialObjUrls.push(url);
                }

                // Fill remaining slots with placeholders
                const allUrls = [...initialUrls];
                const allObjUrls = [...initialObjUrls];
                for (let i = INITIAL_PAGES; i < pageCount; i++) {
                    allUrls.push(PLACEHOLDER_URL);
                }

                pageImageUrlsRef.current = allUrls;
                objectUrlsRef.current = allObjUrls;
                setLoadingProgress(100);
                setPdfReady(true); // 🎉 Show the book NOW

                /* ── 4. Render remaining pages in background ── */
                if (pageCount > INITIAL_PAGES) {
                    setBgProgress(Math.round((INITIAL_PAGES / pageCount) * 100));

                    for (let batchStart = INITIAL_PAGES; batchStart < pageCount; batchStart += RENDER_CONCURRENCY) {
                        if (cancelled) return;
                        const batchEnd = Math.min(batchStart + RENDER_CONCURRENCY, pageCount);
                        const batchPromises: Promise<Blob>[] = [];

                        for (let p = batchStart; p < batchEnd; p++) {
                            batchPromises.push(
                                renderPageToBlob(doc, p + 1, RENDER_SCALE).catch(() => {
                                    const c = document.createElement("canvas");
                                    c.width = PAGE_WIDTH * RENDER_SCALE;
                                    c.height = PAGE_HEIGHT * RENDER_SCALE;
                                    const ctx = c.getContext("2d")!;
                                    ctx.fillStyle = "#fff";
                                    ctx.fillRect(0, 0, c.width, c.height);
                                    return new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
                                })
                            );
                        }

                        const blobs = await Promise.all(batchPromises);

                        for (let k = 0; k < blobs.length; k++) {
                            const idx = batchStart + k;
                            cachePage(bookId, idx, blobs[k]);
                            const url = URL.createObjectURL(blobs[k]);

                            // Update the URL reference
                            pageImageUrlsRef.current[idx] = url;
                            allObjUrls.push(url);

                            // Hot-swap the image in StPageFlip (if initialized)
                            if (pageFlipRef.current) {
                                try {
                                    const page = pageFlipRef.current.getPage(idx) as any;
                                    if (page && typeof page.updateSrc === "function") {
                                        page.updateSrc(url);
                                    }
                                } catch { }
                            }
                        }

                        setBgProgress(Math.round(((batchStart + blobs.length) / pageCount) * 100));
                    }

                    // Finalize cache
                    await finalizeCacheMeta(bookId, pageCount);
                    setBgProgress(100);
                    objectUrlsRef.current = allObjUrls;
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error("PDF loading error:", err);
                    setError(`Failed to load PDF: ${err.message}`);
                }
            }
        }

        loadPages();
        return () => { cancelled = true; };
    }, [bookId, pdfUrl, pdfReady, totalPagesHint]);

    /* ─── Cleanup ─── */
    useEffect(() => {
        return () => {
            for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
        };
    }, []);

    /* ─── Init PageFlip ─── */
    useEffect(() => {
        if (!pdfReady || !bookRef.current) return;
        if (pageImageUrlsRef.current.length === 0) return;
        if (pageFlipRef.current) return;

        const pf = new PageFlip(bookRef.current, {
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            size: "stretch" as any,
            minWidth: 300, maxWidth: 900,
            minHeight: 400, maxHeight: 1200,
            maxShadowOpacity: 0.5,
            showCover: true,
            flippingTime: 800,
            usePortrait: true,
            drawShadow: true,
            mobileScrollSupport: true,
            startPage: 0,
            autoSize: true,
            showPageCorners: true,
            disableFlipByClick: false,
        });

        pf.loadFromImages(pageImageUrlsRef.current);

        pf.on("flip", (e) => {
            const pageIndex = e.data as number;
            setCurrentPage(pageIndex);
            emitPageChange(pageIndex, totalPages);
            if (onFlip) onFlip();
        });

        pageFlipRef.current = pf;
        emitPageChange(0, totalPages);

        return () => {
            if (pageFlipRef.current) {
                try { pageFlipRef.current.destroy(); } catch { }
                pageFlipRef.current = null;
            }
        };
    }, [pdfReady, totalPages, onFlip]);

    /* ─── Navigation ─── */
    const flipNext = useCallback(() => pageFlipRef.current?.flipNext(FlipCorner.BOTTOM), []);
    const flipPrev = useCallback(() => pageFlipRef.current?.flipPrev(FlipCorner.BOTTOM), []);

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

    /* ─── Thumbnail ─── */
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

    /* ─── Error ─── */
    if (error) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center gap-4" style={{ background: "#0b1120" }}>
                <p className="text-red-400 text-sm">{error}</p>
                <button onClick={() => { setError(null); setPdfReady(false); }} className="text-white/50 hover:text-white text-xs underline">
                    Try again
                </button>
            </div>
        );
    }

    /* ─── Loading ─── */
    if (!pdfReady) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center gap-6" style={{ background: "#0b1120" }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 relative">
                        <div className="absolute inset-0 border-2 border-indigo-500/20 rounded-full" />
                        <div className="absolute inset-0 border-2 border-transparent border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                    <p className="text-white/40 text-sm">{loadingMessage} {loadingProgress}%</p>
                    <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500/60 rounded-full transition-all duration-300" style={{ width: `${loadingProgress}%` }} />
                    </div>
                </div>
            </div>
        );
    }

    /* ─── Thumbnails ─── */
    if (thumbnailMode) {
        return (
            <div ref={containerRef} className="h-full w-full overflow-auto" style={{ background: "#0b1120" }}>
                <button onClick={() => setThumbnailMode(false)} className="fixed top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white rounded-full w-10 h-10 flex items-center justify-center backdrop-blur-sm transition-colors">✕</button>
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 p-6">
                    {pageImageUrlsRef.current.map((src, i) => (
                        <button key={i} onClick={() => goToPage(i)} className={`group relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${i === currentPage ? "border-indigo-500 shadow-lg shadow-indigo-500/20" : "border-white/10 hover:border-white/30"}`}>
                            <img src={src} alt={`Page ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent py-1">
                                <span className="text-white/80 text-xs">{i + 1}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    /* ─── Main view ─── */
    return (
        <div ref={containerRef} className="h-full w-full flex flex-col relative select-none" style={{
            background: `linear-gradient(rgba(30,42,71,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(30,42,71,0.45) 1px, transparent 1px), #0b1120`,
            backgroundSize: "120px 90px",
        }}>
            {/* Background render indicator */}
            {bgProgress < 100 && (
                <div className="absolute top-4 left-4 z-40 flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-3 py-1.5">
                    <div className="w-3 h-3 border-2 border-transparent border-t-indigo-400 rounded-full animate-spin" />
                    <span className="text-white/40 text-xs">Rendering… {bgProgress}%</span>
                </div>
            )}

            {/* Toolbar */}
            <div className="absolute top-4 right-4 z-40 flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-xl px-2 py-1.5">
                <ToolbarBtn onClick={() => setThumbnailMode(true)} title="Page grid">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                </ToolbarBtn>
                <ToolbarBtn onClick={toggleFullscreen} title="Fullscreen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                </ToolbarBtn>
                <ToolbarBtn onClick={onToggleSound} active={soundEnabled} title="Sound">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        {soundEnabled ? (<><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></>) : (<line x1="23" y1="9" x2="17" y2="15" />)}
                    </svg>
                </ToolbarBtn>
            </div>

            {/* Book */}
            <div className="flex-1 flex items-center justify-center px-4 py-8 overflow-hidden">
                <div ref={bookRef} className="relative" style={{ maxWidth: "90vw", maxHeight: "80vh" }} />
            </div>

            {/* Bottom bar */}
            <div className="relative z-40 flex items-center gap-4 px-6 py-3">
                <span className="text-white/30 text-xs font-medium tracking-wider hidden sm:block" style={{ minWidth: 100 }}>Bookmosphere</span>
                <button onClick={flipPrev} disabled={currentPage <= 0} className="text-white/50 hover:text-white disabled:opacity-20 transition-colors">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></svg>
                </button>
                <div className="flex-1 h-2 bg-white/10 rounded-full cursor-pointer relative group" onClick={onScrollbarClick}>
                    <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white/60 rounded-full border-2 border-white/30 shadow-lg transition-all group-hover:scale-110" style={{ left: `calc(${scrollbarProgress * 100}% - 10px)` }} />
                </div>
                <button onClick={flipNext} disabled={currentPage >= totalPages - 1} className="text-white/50 hover:text-white disabled:opacity-20 transition-colors">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>
                </button>
                <span className="text-white/40 text-xs tabular-nums" style={{ minWidth: 60, textAlign: "right" }}>{currentPage + 1} / {totalPages}</span>
            </div>
        </div>
    );
}

function ToolbarBtn({ onClick, active, title, children }: { onClick?: () => void; active?: boolean; title?: string; children: React.ReactNode; }) {
    return (
        <button onClick={onClick} title={title} className={`p-2 rounded-lg transition-colors ${active ? "text-white bg-white/10" : "text-white/60 hover:text-white hover:bg-white/5"}`}>
            {children}
        </button>
    );
}
