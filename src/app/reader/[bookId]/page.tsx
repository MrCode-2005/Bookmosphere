"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import FlipbookReader from "@/components/reader/FlipbookReader";
import dynamic from "next/dynamic";
import ControlPanel from "@/components/reader/ControlPanel";
import { usePageFlipSound } from "@/hooks/useSound";
import { useAutoSave, fetchProgress } from "@/hooks/useProgress";

// Dynamic imports — these require browser APIs
const PdfFlipbookReader = dynamic(() => import("@/components/reader/PdfFlipbookReader"), { ssr: false });
const PdfReaderMode = dynamic(() => import("@/components/reader/PdfReaderMode"), { ssr: false });
const EpubReaderMode = dynamic(() => import("@/components/reader/EpubReaderMode"), { ssr: false });
const EpubFlipMode = dynamic(() => import("@/components/reader/EpubFlipMode"), { ssr: false });

interface BookPage {
    pageNumber: number;
    content: string;
}

interface BookData {
    id: string;
    title: string;
    author: string | null;
    totalPages: number;
    totalWords: number;
    status: string;
    fileType: string;
    originalFormat?: string;
    pdfFileUrl?: string;
    epubFileUrl?: string;
    conversionStatus?: string;
    conversionError?: string;
    signedUrl?: string;
    pages: BookPage[];
}

type ReadingMode = "reader" | "flip";

export default function ReaderPage() {
    const params = useParams();
    const router = useRouter();
    const bookId = params.bookId as string;
    const { accessToken } = useAuthStore();
    const containerRef = useRef<HTMLDivElement>(null);

    const [book, setBook] = useState<BookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [fontSize, setFontSize] = useState(18);
    const [savedPage, setSavedPage] = useState(0);
    const [savedCfi, setSavedCfi] = useState<string | undefined>();
    const [savedChapter, setSavedChapter] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [readingMode, setReadingMode] = useState<ReadingMode>("reader");
    const [currentProgress, setCurrentProgress] = useState({ percentage: 0, page: 0 });
    const [showTopBar, setShowTopBar] = useState(false);
    const [showBottomBar, setShowBottomBar] = useState(false);
    const [chapterTitle, setChapterTitle] = useState("");
    const [progressHovered, setProgressHovered] = useState(false);

    // No toggleUI needed — hover zones handle visibility

    // Sound
    const { play: playFlipSound, enabled: soundEnabled, toggle: toggleSound } = usePageFlipSound();

    // Fullscreen
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    // Font size
    const handleFontSizeChange = useCallback((delta: number) => {
        setFontSize((prev) => Math.max(14, Math.min(24, prev + delta)));
    }, []);

    // Toggle reading mode
    const toggleMode = useCallback(() => {
        setReadingMode((prev) => (prev === "reader" ? "flip" : "reader"));
    }, []);

    // Fetch book data
    useEffect(() => {
        if (!bookId || !accessToken) return;

        const fetchBook = async () => {
            try {
                const res = await fetch(`/api/books/${bookId}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (!res.ok) {
                    if (res.status === 404) setError("Book not found");
                    else if (res.status === 401) router.push("/login");
                    else setError("Failed to load book");
                    return;
                }

                const data = await res.json();
                const bookData = data.book || data.data;

                if (bookData.status !== "READY") {
                    setError("Book is still processing. Please wait...");
                    return;
                }

                setBook(bookData);

                // Auto-migrate: if this book doesn't have originalFormat set,
                // backfill it so the mode toggle works without re-uploading
                if (!bookData.originalFormat) {
                    fetch("/api/books/migrate", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${accessToken}` },
                    }).catch(() => { /* best effort */ });
                }

                // Ensure EPUB and PDF books always have their format-specific URLs
                if (bookData.fileType === "PDF") {
                    bookData.pdfFileUrl = bookData.pdfFileUrl || bookData.signedUrl;
                } else if (bookData.fileType === "EPUB") {
                    bookData.epubFileUrl = bookData.epubFileUrl || bookData.signedUrl;
                }

                // Auto-reprocess old EPUB books with dummy content
                if (bookData.fileType === "EPUB" && bookData.totalPages <= 1 && bookData.pages?.length <= 1) {
                    const dummyContent = bookData.pages?.[0]?.content || "";
                    if (dummyContent.includes("EPUB parsing not yet supported") || dummyContent.includes("Empty document")) {
                        // Trigger re-processing in background
                        fetch(`/api/books/${bookId}/reprocess`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${accessToken}` },
                        }).catch(() => { /* best effort */ });
                    }
                }

                // Default to Reader Mode for all formats
                setReadingMode("reader");

                // Restore saved progress
                const progress = await fetchProgress(bookId, accessToken);
                if (progress) {
                    if (progress.currentPage > 0) setSavedPage(progress.currentPage);
                    if (progress.chapterIndex && progress.chapterIndex > 0) setSavedChapter(progress.chapterIndex);
                    if (progress.readingMode === "reader" || progress.readingMode === "flip") {
                        setReadingMode(progress.readingMode);
                    }
                }
            } catch {
                setError("Failed to load book");
            } finally {
                setLoading(false);
            }
        };

        fetchBook();
    }, [bookId, accessToken, router]);

    // Progress callback from EPUB Reader Mode
    const handleEpubProgress = useCallback((progress: {
        percentage: number;
        currentPage: number;
        totalPages: number;
        chapterIndex: number;
        cfi: string;
        chapterTitle: string;
    }) => {
        setCurrentProgress({ percentage: progress.percentage, page: progress.currentPage });
        setSavedCfi(progress.cfi);
        setSavedChapter(progress.chapterIndex);
        if (progress.chapterTitle) setChapterTitle(progress.chapterTitle);
    }, []);

    // Determine available URLs
    const epubUrl = book?.epubFileUrl || (book?.fileType === "EPUB" ? book?.signedUrl : undefined);
    const pdfUrl = book?.pdfFileUrl || (book?.fileType === "PDF" ? book?.signedUrl : undefined);
    const hasEpub = !!epubUrl;
    const hasPdf = !!pdfUrl;
    const conversionPending = book?.conversionStatus === "PENDING" || book?.conversionStatus === "PROCESSING";
    const conversionFailed = book?.conversionStatus === "FAILED";

    // Poll conversion status for PDF books being converted
    useEffect(() => {
        if (!conversionPending || !bookId || !accessToken) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/books/${bookId}/convert`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                const conv = data.conversion;

                if (conv?.conversionStatus === "COMPLETED" && conv?.epubFileUrl) {
                    // Conversion done! Update book state
                    setBook((prev) => prev ? {
                        ...prev,
                        conversionStatus: "COMPLETED",
                        epubFileUrl: conv.epubFileUrl,
                    } : prev);
                    clearInterval(interval);
                } else if (conv?.conversionStatus === "FAILED") {
                    setBook((prev) => prev ? {
                        ...prev,
                        conversionStatus: "FAILED",
                        conversionError: conv.conversionError,
                    } : prev);
                    clearInterval(interval);
                }
            } catch { /* ignore polling errors */ }
        }, 5000);

        return () => clearInterval(interval);
    }, [conversionPending, bookId, accessToken]);

    // ─── Loading ───
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: "#000" }}>
                <div className="text-center space-y-4">
                    <div className="animate-spin w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full mx-auto" />
                    <p style={{ color: "#666", fontSize: 14 }}>Loading your book...</p>
                </div>
            </div>
        );
    }

    // ─── Error ───
    if (error || !book) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: "#000" }}>
                <div className="text-center space-y-4">
                    <p style={{ color: "#ef4444" }}>{error || "Book not found"}</p>
                    <button onClick={() => router.back()} style={{ color: "#888", fontSize: 14, textDecoration: "underline" }}>
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    // ─── Render based on mode ───
    return (
        <div ref={containerRef} className="h-screen w-screen relative" style={{ background: "#000", cursor: "default" }}>

            {/* ═══ TOP HOVER ZONE ═══ — invisible trigger area */}
            <div
                onMouseEnter={() => setShowTopBar(true)}
                onMouseLeave={() => setShowTopBar(false)}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: showTopBar ? "auto" : 60,
                    zIndex: 60,
                }}
            >
                {/* ═══ TOP BAR ═══ */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)",
                    opacity: showTopBar ? 1 : 0,
                    pointerEvents: showTopBar ? "auto" : "none",
                    transition: "opacity 0.3s ease",
                }}>
                    {/* Back button */}
                    <button
                        onClick={() => router.back()}
                        style={{ color: "#888", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                        Back
                    </button>

                    {/* Title */}
                    <div style={{ textAlign: "center", flex: 1, marginInline: 16 }}>
                        <div style={{ color: "#aaa", fontSize: 13, fontWeight: 500, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {book.title}
                        </div>
                        {book.author && <div style={{ color: "#555", fontSize: 11 }}>{book.author}</div>}
                    </div>

                    {/* Controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* Mode Toggle — Segmented Control */}
                        {(hasEpub || hasPdf) && (
                            <div style={{
                                display: "flex",
                                background: "#111",
                                borderRadius: 8,
                                border: "1px solid #333",
                                overflow: "hidden",
                            }}>
                                <button
                                    onClick={() => setReadingMode("reader")}
                                    style={{
                                        padding: "5px 14px",
                                        fontSize: 12,
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        border: "none",
                                        background: readingMode === "reader" ? "#2563eb" : "transparent",
                                        color: readingMode === "reader" ? "#fff" : "#666",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    Reader
                                </button>
                                <button
                                    onClick={() => setReadingMode("flip")}
                                    style={{
                                        padding: "5px 14px",
                                        fontSize: 12,
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        border: "none",
                                        borderLeft: "1px solid #333",
                                        background: readingMode === "flip" ? "#2563eb" : "transparent",
                                        color: readingMode === "flip" ? "#fff" : "#666",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    Flip
                                </button>
                            </div>
                        )}

                        {/* Sound Toggle */}
                        <button
                            onClick={toggleSound}
                            style={{
                                background: "transparent",
                                border: "1px solid #333",
                                borderRadius: 8,
                                padding: "4px 8px",
                                color: soundEnabled ? "#93B5FF" : "#555",
                                fontSize: 14,
                                cursor: "pointer",
                            }}
                        >
                            {soundEnabled ? "🔊" : "🔇"}
                        </button>

                        {/* Fullscreen */}
                        <button
                            onClick={toggleFullscreen}
                            style={{
                                background: "transparent",
                                border: "1px solid #333",
                                borderRadius: 8,
                                padding: "4px 8px",
                                color: "#888",
                                fontSize: 14,
                                cursor: "pointer",
                            }}
                        >
                            {isFullscreen ? "⊡" : "⛶"}
                        </button>

                        {/* Font size (Reader Mode only) */}
                        {readingMode === "reader" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <button
                                    onClick={() => handleFontSizeChange(-1)}
                                    style={{ background: "transparent", border: "1px solid #333", borderRadius: 6, padding: "2px 8px", color: "#888", fontSize: 12, cursor: "pointer" }}
                                >
                                    A-
                                </button>
                                <span style={{ color: "#666", fontSize: 11, minWidth: 24, textAlign: "center" }}>{fontSize}</span>
                                <button
                                    onClick={() => handleFontSizeChange(1)}
                                    style={{ background: "transparent", border: "1px solid #333", borderRadius: 6, padding: "2px 8px", color: "#888", fontSize: 12, cursor: "pointer" }}
                                >
                                    A+
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div> {/* end top hover zone */}

            {/* Conversion banner */}
            {conversionPending && readingMode === "reader" && !hasEpub && (
                <div style={{
                    position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)",
                    zIndex: 40, background: "#1a1a2e", border: "1px solid #333",
                    borderRadius: 8, padding: "8px 16px", color: "#93B5FF", fontSize: 12,
                }}>
                    ⏳ Converting PDF to EPUB for Reader Mode... (Flip Mode available now)
                </div>
            )}

            {conversionFailed && readingMode === "reader" && !hasEpub && (
                <div style={{
                    position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)",
                    zIndex: 40, background: "#2e1a1a", border: "1px solid #333",
                    borderRadius: 8, padding: "8px 16px", color: "#ff6b6b", fontSize: 12,
                    display: "flex", gap: 8, alignItems: "center",
                }}>
                    ❌ Conversion failed
                    <button
                        onClick={async () => {
                            if (!accessToken) return;
                            await fetch(`/api/books/${bookId}/convert`, {
                                method: "POST",
                                headers: { Authorization: `Bearer ${accessToken}` },
                            });
                            setBook((b) => b ? { ...b, conversionStatus: "PENDING" } : b);
                        }}
                        style={{ color: "#93B5FF", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* ─── READER MODE ─── */}
            {readingMode === "reader" && hasEpub && (
                <div style={{ width: "100%", height: "100%" }}>
                    <EpubReaderMode
                        epubUrl={epubUrl!}
                        bookId={bookId}
                        initialCfi={savedCfi}
                        initialChapter={savedChapter}
                        onProgressChange={handleEpubProgress}
                        onCenterTap={() => { }}
                        fontSize={fontSize}
                    />
                </div>
            )}

            {/* Reader Mode for PDFs — extract text and render in Apple Books typography */}
            {readingMode === "reader" && !hasEpub && hasPdf && (
                <div style={{ width: "100%", height: "100%", paddingTop: 44 }}>
                    <PdfReaderMode
                        pdfUrl={pdfUrl!}
                        bookId={bookId}
                        totalPages={book.totalPages}
                        initialPage={savedPage}
                        fontSize={fontSize}
                        lineHeight={1.65}
                        maxWidth={720}
                        onProgressChange={(p) => setCurrentProgress({ percentage: p.percentage, page: p.currentPage })}
                    />
                </div>
            )}

            {/* ─── FLIP MODE ─── */}
            {readingMode === "flip" && hasPdf && (
                <div style={{ width: "100%", height: "100%" }}>
                    <PdfFlipbookReader
                        bookId={bookId}
                        pdfUrl={pdfUrl!}
                        totalPages={book.totalPages}
                        title={book.title}
                        author={book.author}
                        initialPage={savedPage}
                        onFlip={playFlipSound}
                        soundEnabled={soundEnabled}
                        onToggleSound={toggleSound}
                        onBack={() => router.back()}
                    />
                </div>
            )}

            {/* Flip Mode for EPUB-only books (no PDF available) */}
            {readingMode === "flip" && !hasPdf && hasEpub && (
                <div style={{ width: "100%", height: "100%", paddingTop: 44 }}>
                    <EpubFlipMode
                        epubUrl={epubUrl!}
                        bookId={bookId}
                        initialChapter={savedChapter}
                        onProgressChange={(p) => setCurrentProgress({ percentage: p.percentage, page: p.currentPage })}
                    />
                </div>
            )}

            {/* ─── TEXT MODE (fallback for TXT files) ─── */}
            {!hasPdf && !hasEpub && book.pages?.length > 0 && (
                <div style={{ width: "100%", height: "100%", paddingTop: 44 }}>
                    <FlipbookReader
                        pages={book.pages}
                        initialPage={savedPage}
                        fontSize={fontSize}
                        onFlip={playFlipSound}
                    />
                    <ControlPanel
                        onToggleSound={toggleSound}
                        soundEnabled={soundEnabled}
                        onToggleFullscreen={toggleFullscreen}
                        isFullscreen={isFullscreen}
                        onFontSizeChange={handleFontSizeChange}
                        fontSize={fontSize}
                    />
                </div>
            )}

            {/* ═══ BOTTOM BAR ═══ — Page number + progress bar */}
            {/* Always-visible page number when bottom bar is hidden */}
            <div style={{
                position: "absolute",
                bottom: 8,
                left: 0,
                right: 0,
                zIndex: 45,
                textAlign: "center",
                opacity: showBottomBar ? 0 : 0.5,
                transition: "opacity 0.3s ease",
                pointerEvents: "none",
            }}>
                <span style={{ color: "#555", fontSize: 12, fontFamily: "Georgia, serif" }}>
                    {currentProgress.page || savedPage || 1}
                </span>
            </div>

            {/* Full progress bar (auto-hide, shown on tap) */}
            {/* Bottom hover zone — invisible trigger always receives hover */}
            <div
                onMouseEnter={() => { setShowBottomBar(true); setProgressHovered(true); }}
                onMouseLeave={() => { setShowBottomBar(false); setProgressHovered(false); }}
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: showBottomBar ? "auto" : 60,
                    zIndex: 50,
                }}
            >
                <div style={{
                    padding: "12px 20px 14px",
                    background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)",
                    opacity: showBottomBar ? 1 : 0,
                    pointerEvents: showBottomBar ? "auto" : "none",
                    transition: "opacity 0.3s ease",
                }}
                >
                    {/* Chapter title */}
                    {chapterTitle && (
                        <div style={{ textAlign: "center", marginBottom: 8 }}>
                            <span style={{ color: "#555", fontSize: 11, fontFamily: "Georgia, serif" }}>
                                {chapterTitle}
                            </span>
                        </div>
                    )}

                    {/* Progress slider */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 500, margin: "0 auto" }}>
                        <span style={{ color: "#555", fontSize: 11, fontFamily: "Georgia, serif", minWidth: 20, textAlign: "right" }}>
                            {currentProgress.page || savedPage || 1}
                        </span>
                        <div style={{
                            flex: 1,
                            height: 3,
                            background: "#222",
                            borderRadius: 2,
                            overflow: "hidden",
                        }}>
                            <div
                                style={{
                                    height: "100%",
                                    background: "#888",
                                    borderRadius: 2,
                                    transition: "width 0.3s ease",
                                    width: `${Math.min(100, currentProgress.percentage)}%`,
                                }}
                            />
                        </div>
                        <span style={{ color: "#555", fontSize: 11, fontFamily: "Georgia, serif", minWidth: 20 }}>
                            {book.totalPages}
                        </span>
                    </div>

                    {/* Page info — shows "X of Y" on hover */}
                    <div style={{ textAlign: "center", marginTop: 6 }}>
                        <span style={{ color: "#444", fontSize: 11, fontFamily: "Georgia, serif" }}>
                            {progressHovered
                                ? `${currentProgress.page || savedPage || 1} of ${book.totalPages}`
                                : `${currentProgress.page || savedPage || 1}`}
                        </span>
                    </div>
                </div> {/* end inner bottom bar */}
            </div> {/* end bottom hover zone */}

            {/* Auto-save provider */}
            <AutoSaveProvider bookId={bookId} totalPages={book.totalPages} totalWords={book.totalWords} />
        </div>
    );
}

/** Invisible component that activates auto-save */
function AutoSaveProvider({ bookId, totalPages, totalWords }: { bookId: string; totalPages: number; totalWords?: number }) {
    useAutoSave({ bookId, totalPages, totalWords });
    return null;
}
