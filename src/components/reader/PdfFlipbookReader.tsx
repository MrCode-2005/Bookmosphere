"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PageFlip, FlipCorner } from "@/lib/page-flip";
import "@/lib/page-flip/Style/stPageFlip.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/* ─── Emit page change to parent (auto-save hook) ─── */
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
    bookId: string;
    pdfUrl: string;
    totalPages: number;
    title?: string;
    author?: string | null;
    initialPage?: number;
    onFlip?: () => void;
    soundEnabled?: boolean;
    onToggleSound?: () => void;
    onBack?: () => void;
}

/* ═══════════════════════════════════════════════════════════════
 *   PdfFlipbookReader — HTML-Canvas Lazy Render Mode
 *   Ported from FlipBook animation/flipbook.html
 *   Features: lazy canvas rendering, real MP3 sound, zoom,
 *             outline/TOC panel, dynamic shadows, top bar
 * ═══════════════════════════════════════════════════════════════ */
export default function PdfFlipbookReader({
    bookId,
    pdfUrl,
    totalPages: totalPagesHint,
    title = "Untitled",
    author,
    initialPage = 1,
    onFlip,
    soundEnabled = true,
    onToggleSound,
    onBack,
}: PdfFlipbookReaderProps) {
    /* ─── State ─── */
    const [totalPages, setTotalPages] = useState(totalPagesHint || 0);
    const [currentPage, setCurrentPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingText, setLoadingText] = useState("Processing PDF...");
    const [error, setError] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [pageInputValue, setPageInputValue] = useState("1");
    const [outlineOpen, setOutlineOpen] = useState(false);
    const [outlineItems, setOutlineItems] = useState<{ title: string; page: number | null }[]>([]);
    const [outlineLoaded, setOutlineLoaded] = useState(false);

    /* ─── Refs ─── */
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<HTMLDivElement>(null);
    const flipbookRef = useRef<HTMLDivElement>(null);
    const pageFlipRef = useRef<PageFlip | null>(null);
    const pdfDocRef = useRef<any>(null);
    const renderedPagesRef = useRef<Set<number>>(new Set());
    const flipAudioRef = useRef<HTMLAudioElement | null>(null);
    const soundEnabledRef = useRef(soundEnabled);
    const onFlipRef = useRef(onFlip);

    /* ─── Load audio ─── */
    useEffect(() => {
        flipAudioRef.current = new Audio("/sounds/page-flip.mp3");
        flipAudioRef.current.preload = "auto";
        return () => { flipAudioRef.current = null; };
    }, []);

    /* ─── Keep refs in sync ─── */
    useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
    useEffect(() => { onFlipRef.current = onFlip; }, [onFlip]);

    /* ─── Render a single PDF page onto its canvas ─── */
    const renderPage = useCallback(async (pageNum: number) => {
        const doc = pdfDocRef.current;
        if (!doc) return;
        if (pageNum < 1 || pageNum > totalPages) return;
        if (renderedPagesRef.current.has(pageNum)) return;

        renderedPagesRef.current.add(pageNum);

        try {
            const page = await doc.getPage(pageNum);
            const scale = (window.devicePixelRatio || 2.0) * 1.5; // DPR × 1.5 for crystal clarity
            const viewport = page.getViewport({ scale });

            // Render PDF page onto its canvas element
            const canvas = document.getElementById(`canvas-${pageNum}`) as HTMLCanvasElement | null;
            if (!canvas) { renderedPagesRef.current.delete(pageNum); return; }

            const ctx = canvas.getContext("2d", { alpha: false })!;
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: ctx, viewport }).promise;

            // Hide the per-page loader text
            const loader = document.getElementById(`loader-${pageNum}`);
            if (loader) loader.style.display = "none";
        } catch (err) {
            console.error(`Error rendering page ${pageNum}:`, err);
            renderedPagesRef.current.delete(pageNum); // allow retry
        }
    }, [totalPages]);

    /* ─── Main initialization ─── */
    useEffect(() => {
        if (!pdfUrl) return;
        let cancelled = false;

        async function init() {
            try {
                setLoadingText("Loading PDF...");

                const doc = await pdfjs.getDocument({
                    url: pdfUrl,
                    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
                    cMapPacked: true,
                    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
                    isEvalSupported: false,
                    wasmUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/wasm/`,
                } as any).promise;

                if (cancelled) return;
                pdfDocRef.current = doc;

                const pageCount = doc.numPages;
                if (pageCount === 0) { setError("PDF has no pages"); return; }
                setTotalPages(pageCount);

                setLoadingText("Preparing flipbook...");

                // Get page 1 dimensions for StPageFlip sizing
                const page1 = await doc.getPage(1);
                const viewport1 = page1.getViewport({ scale: 1.0 });

                if (cancelled || !flipbookRef.current) return;

                // Calculate scaled dimensions to fill ~82% of viewport height
                const targetHeight = window.innerHeight * 0.75;
                const scaleFactor = targetHeight / viewport1.height;
                const scaledW = Math.round(viewport1.width * scaleFactor);
                const scaledH = Math.round(viewport1.height * scaleFactor);

                const fbEl = flipbookRef.current;

                // Create HTML page elements with canvas per page
                for (let i = 1; i <= pageCount; i++) {
                    const pageEl = document.createElement("div");
                    pageEl.className = "page";
                    // Hard covers for first and last page
                    if (i === 1 || i === pageCount) {
                        pageEl.setAttribute("data-density", "hard");
                    }
                    pageEl.innerHTML = `
                        <div style="width:100%;height:100%;position:relative;background:#fff;overflow:hidden">
                            <div id="loader-${i}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;font-size:0.8rem">Loading...</div>
                            <canvas id="canvas-${i}" style="width:100%;height:100%;object-fit:contain"></canvas>
                        </div>
                    `;
                    fbEl.appendChild(pageEl);
                }

                // Initialize StPageFlip in HTML mode
                const pf = new PageFlip(fbEl, {
                    width: scaledW,
                    height: scaledH,
                    size: "fixed" as any,
                    minWidth: 315,
                    maxWidth: 4000,
                    minHeight: 420,
                    maxHeight: 4000,
                    maxShadowOpacity: 0.5,
                    showCover: true,
                    mobileScrollSupport: false,
                    usePortrait: false,
                    flippingTime: 800,
                    drawShadow: true,
                    showPageCorners: true,
                    disableFlipByClick: false,
                    startPage: 0,
                    autoSize: true,
                });

                pf.loadFromHTML(document.querySelectorAll(".page"));
                pageFlipRef.current = pf;

                // Initial render: first 3 pages
                await renderPage(1);
                if (pageCount > 1) await renderPage(2);
                if (pageCount > 2) await renderPage(3);

                // Event: on flip — lazy render + sound + shadow
                pf.on("flip", (e) => {
                    const pageIndex = e.data as number;
                    const pageNum = pageIndex + 1;
                    setCurrentPage(pageIndex);
                    emitPageChange(pageIndex, totalPages || pageCount);

                    // Play real page-turn sound
                    if (soundEnabledRef.current && flipAudioRef.current) {
                        try {
                            flipAudioRef.current.currentTime = 0;
                            flipAudioRef.current.play().catch(() => { });
                        } catch { }
                    }
                    if (onFlipRef.current) onFlipRef.current();

                    // Lazy render surrounding pages
                    renderPage(pageNum - 1);
                    renderPage(pageNum);
                    renderPage(pageNum + 1);
                    renderPage(pageNum + 2);

                    // Dynamic box-shadow on cover pages
                    if (pageIndex === 0) {
                        fbEl.style.boxShadow = "20px 0 20px -5px rgba(0, 0, 0, 0.5)";
                    } else if (pageIndex === pageCount - 1 && pageCount % 2 === 0) {
                        fbEl.style.boxShadow = "-20px 0 20px -5px rgba(0, 0, 0, 0.5)";
                    } else {
                        fbEl.style.boxShadow = "0 0 20px 0 rgba(0, 0, 0, 0.5)";
                    }
                });

                // Inject spine crease element inside .stf__block
                // (must be in the same stacking context as pages for z-index to work)
                const block = fbEl.querySelector(".stf__block");
                if (block) {
                    const spine = document.createElement("div");
                    spine.className = "stf__spine";
                    block.appendChild(spine);
                }

                // Initial shadow for front cover
                fbEl.style.boxShadow = "20px 0 20px -5px rgba(0, 0, 0, 0.5)";

                // Show the book
                fbEl.style.display = "block";
                setLoading(false);
                emitPageChange(0, pageCount);

                // Background prefetch remaining pages
                if (pageCount > 3) {
                    (async () => {
                        for (let i = 4; i <= pageCount; i++) {
                            if (cancelled) return;
                            await renderPage(i);
                            // 50ms delay to avoid freezing the main thread
                            await new Promise((r) => setTimeout(r, 50));
                        }
                    })();
                }

            } catch (err: any) {
                if (!cancelled) {
                    console.error("PDF loading error:", err);
                    setError(`Failed to load PDF: ${err.message}`);
                }
            }
        }

        init();
        return () => {
            cancelled = true;
            if (pageFlipRef.current) {
                try { pageFlipRef.current.destroy(); } catch { }
                pageFlipRef.current = null;
            }
        };
    }, [pdfUrl, renderPage]);

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

    /* ─── Page input jump ─── */
    const handlePageInput = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key !== "Enter") return;
            const val = parseInt(pageInputValue, 10);
            if (val > 0 && val <= totalPages && pageFlipRef.current) {
                pageFlipRef.current.turnToPage(val - 1);
                setCurrentPage(val - 1);
                emitPageChange(val - 1, totalPages);
            } else {
                // Reset to current page if invalid
                setPageInputValue(String(currentPage + 1));
            }
        },
        [totalPages, pageInputValue, currentPage]
    );

    // Keep input in sync when page changes via flipping
    useEffect(() => {
        setPageInputValue(String(currentPage + 1));
    }, [currentPage]);

    /* ─── Fullscreen ─── */
    const toggleFullscreen = useCallback(() => {
        const elem = document.documentElement;
        if (!document.fullscreenElement) {
            elem.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }, []);

    /* ─── Zoom ─── */
    const zoomIn = useCallback(() => {
        setZoomLevel((z) => {
            const nz = Math.min(3, z + 0.2);
            if (flipbookRef.current) flipbookRef.current.style.transform = `scale(${nz})`;
            return nz;
        });
    }, []);

    const zoomOut = useCallback(() => {
        setZoomLevel((z) => {
            const nz = Math.max(0.5, z - 0.2);
            if (flipbookRef.current) flipbookRef.current.style.transform = `scale(${nz})`;
            return nz;
        });
    }, []);

    /* ─── Outline / TOC ─── */
    const loadOutline = useCallback(async () => {
        if (outlineLoaded || !pdfDocRef.current) return;
        setOutlineLoaded(true);

        try {
            const doc = pdfDocRef.current;
            const outline = await doc.getOutline();

            if (outline && outline.length > 0) {
                const items: { title: string; page: number | null }[] = [];
                for (const item of outline) {
                    let pageNum: number | null = null;
                    try {
                        let dest = item.dest;
                        if (typeof dest === "string") dest = await doc.getDestination(dest);
                        if (Array.isArray(dest)) {
                            const ref = dest[0];
                            if (typeof ref === "object") {
                                pageNum = await doc.getPageIndex(ref);
                            } else if (Number.isInteger(ref)) {
                                pageNum = ref;
                            }
                        }
                    } catch { }
                    items.push({ title: item.title, page: pageNum });
                }
                setOutlineItems(items);
            } else {
                // Fallback: page list
                const items = Array.from({ length: totalPages }, (_, i) => ({
                    title: `Page ${i + 1}`,
                    page: i,
                }));
                setOutlineItems(items);
            }
        } catch {
            setOutlineItems([{ title: "Failed to load outline", page: null }]);
        }
    }, [outlineLoaded, totalPages]);

    const toggleOutline = useCallback(() => {
        if (!outlineOpen) loadOutline();
        setOutlineOpen((v) => !v);
    }, [outlineOpen, loadOutline]);

    const goToOutlinePage = useCallback(
        (pageIndex: number) => {
            if (pageFlipRef.current) {
                pageFlipRef.current.turnToPage(pageIndex);
                setCurrentPage(pageIndex);
                emitPageChange(pageIndex, totalPages);
                setOutlineOpen(false);
                // Render surrounding pages
                renderPage(pageIndex);
                renderPage(pageIndex + 1);
                renderPage(pageIndex + 2);
                renderPage(pageIndex + 3);
            }
        },
        [totalPages, renderPage]
    );

    /* ─── Error state ─── */
    if (error) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center gap-4" style={{ background: "#111827" }}>
                <p className="text-red-400 text-sm">{error}</p>
                <button
                    onClick={() => { setError(null); setLoading(true); }}
                    className="text-white/50 hover:text-white text-xs underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="h-full w-full relative select-none" style={{ background: "#111827", fontFamily: "'Inter', sans-serif", overflow: "hidden" }}>

            {/* ─── Top Bar ─── */}
            <div className="absolute top-0 left-0 right-0 z-[100] flex items-center gap-4 px-6 py-4"
                style={{ background: "rgba(17, 24, 39, 0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}
            >
                {onBack && (
                    <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Library
                    </button>
                )}
                <h1 className="text-gray-100 font-semibold text-base truncate flex-1">{title}</h1>
                {author && <span className="text-gray-400 text-sm hidden md:block">{author}</span>}
            </div>

            {/* ─── Loading Overlay ─── */}
            {loading && (
                <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center"
                    style={{ background: "#111827", transition: "opacity 0.3s ease" }}
                >
                    <div className="w-10 h-10 border-3 rounded-full animate-spin"
                        style={{ borderColor: "rgba(79, 70, 229, 0.2)", borderTopColor: "#4f46e5" }}
                    />
                    <p className="mt-4 text-gray-400 text-sm">{loadingText}</p>
                </div>
            )}

            {/* ─── Viewer Container (zoomable) ─── */}
            <div
                ref={viewerRef}
                className="absolute flex items-center justify-center overflow-hidden"
                style={{
                    top: "60px",
                    bottom: "60px",
                    left: 0,
                    right: 0,
                    backgroundColor: "#0b1120",
                    backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                    backgroundSize: "50px 50px",
                    padding: "20px 60px",
                    boxSizing: "border-box",
                }}
            >
                {/* The StPageFlip container — HTML pages appended here */}
                <div ref={flipbookRef} style={{ display: "none", boxShadow: "0 0 20px 0 rgba(0,0,0,0.5)", transformOrigin: "center center", transition: "transform 0.2s ease" }} />
            </div>

            {/* ─── Outline / Contents Panel ─── */}
            {outlineOpen && (
                <div
                    className="absolute z-[150]"
                    style={{
                        bottom: "70px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "320px",
                        maxHeight: "450px",
                        background: "#f9fafb",
                        color: "#111827",
                        border: "1px solid rgba(0,0,0,0.1)",
                        borderRadius: "8px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                        overflowY: "auto",
                        fontSize: "0.95rem",
                    }}
                >
                    <div className="sticky top-0 z-[2] flex justify-between items-center px-5 py-4 font-semibold"
                        style={{ background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}
                    >
                        <span>Contents</span>
                        <button onClick={() => setOutlineOpen(false)} className="text-gray-500 hover:text-gray-900 text-xl leading-none">&times;</button>
                    </div>
                    {outlineItems.length === 0 ? (
                        <div className="p-5 text-center text-gray-600">Loading Contents...</div>
                    ) : (
                        outlineItems.map((item, idx) => (
                            <div
                                key={idx}
                                className="flex items-center px-5 py-2.5 font-medium cursor-pointer transition-colors hover:bg-gray-200"
                                style={{ color: "#000" }}
                                onClick={() => item.page !== null && goToOutlinePage(item.page)}
                            >
                                {item.title}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ─── Bottom Toolbar ─── */}
            {!loading && (
                <div
                    className="absolute z-[100] flex items-center justify-center"
                    style={{
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: "60px",
                        backgroundColor: "#0b1120",
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                        backgroundSize: "50px 50px",
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                    }}
                >
                    <div
                        className="flex items-center gap-2.5"
                        style={{
                            background: "rgba(31, 41, 55, 0.95)",
                            padding: "0 1.5rem",
                            borderRadius: "8px",
                            backdropFilter: "blur(8px)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            height: "44px",
                        }}
                    >
                        {/* Prev */}
                        <ToolbarBtn onClick={flipPrev} title="Previous Page">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </ToolbarBtn>

                        {/* Page Info */}
                        <div className="flex items-center gap-1 mx-2.5 text-white font-mono text-sm">
                            <input
                                type="text"
                                value={pageInputValue}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/[^0-9]/g, "");
                                    setPageInputValue(raw);
                                }}
                                onKeyDown={handlePageInput}
                                onBlur={() => setPageInputValue(String(currentPage + 1))}
                                className="w-10 text-center rounded px-1 py-0.5"
                                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid #4b5563", color: "#fff" }}
                            />
                            <span className="text-gray-300">/ {totalPages}</span>
                        </div>

                        {/* Next */}
                        <ToolbarBtn onClick={flipNext} title="Next Page">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </ToolbarBtn>

                        <Divider />

                        {/* Outline / Contents */}
                        <ToolbarBtn onClick={toggleOutline} title="Contents">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                            </svg>
                        </ToolbarBtn>

                        <Divider />

                        {/* Zoom In */}
                        <ToolbarBtn onClick={zoomIn} title="Zoom In">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                        </ToolbarBtn>

                        {/* Zoom Out */}
                        <ToolbarBtn onClick={zoomOut} title="Zoom Out">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                        </ToolbarBtn>

                        {/* Fullscreen */}
                        <ToolbarBtn onClick={toggleFullscreen} title="Fullscreen">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 3 21 3 21 9" />
                                <polyline points="9 21 3 21 3 15" />
                                <line x1="21" y1="3" x2="14" y2="10" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                        </ToolbarBtn>

                        {/* Sound Toggle */}
                        <ToolbarBtn onClick={onToggleSound} title="Sound" active={soundEnabled}>
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
                </div>
            )}
        </div>
    );
}

/* ─── Reusable toolbar button ─── */
function ToolbarBtn({
    onClick,
    title,
    active,
    children,
}: {
    onClick?: () => void;
    title?: string;
    active?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className="flex items-center justify-center rounded transition-all"
            style={{
                background: active ? "rgba(255,255,255,0.1)" : "transparent",
                border: "none",
                color: active ? "#fff" : "#d1d5db",
                fontSize: "1.25rem",
                cursor: "pointer",
                padding: "0.5rem",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = active ? "#fff" : "#d1d5db"; e.currentTarget.style.background = active ? "rgba(255,255,255,0.1)" : "transparent"; }}
        >
            {children}
        </button>
    );
}

/* ─── Toolbar divider ─── */
function Divider() {
    return <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 4px" }} />;
}
