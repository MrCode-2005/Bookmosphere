"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import FlipbookReader from "@/components/reader/FlipbookReader";
import dynamic from "next/dynamic";
import ControlPanel from "@/components/reader/ControlPanel";
import { usePageFlipSound } from "@/hooks/useSound";
import { useAutoSave, fetchProgress } from "@/hooks/useProgress";

// Dynamic import with SSR disabled — pdfjs-dist requires browser APIs
const PdfFlipbookReader = dynamic(() => import("@/components/reader/PdfFlipbookReader"), { ssr: false });

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
    signedUrl?: string;
    pages: BookPage[];
}

export default function ReaderPage() {
    const params = useParams();
    const router = useRouter();
    const bookId = params.bookId as string;
    const { accessToken } = useAuthStore();
    const containerRef = useRef<HTMLDivElement>(null);

    const [book, setBook] = useState<BookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [fontSize, setFontSize] = useState(16);
    const [savedPage, setSavedPage] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

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
        setFontSize((prev) => Math.max(12, Math.min(24, prev + delta)));
    }, []);

    // Fetch book
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

                // Restore saved progress
                if (accessToken) {
                    const progress = await fetchProgress(bookId, accessToken);
                    if (progress && progress.currentPage > 0) {
                        setSavedPage(progress.currentPage);
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

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#1a1510]">
                <div className="text-center space-y-4">
                    <div className="animate-spin w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full mx-auto" />
                    <p className="text-amber-200/60 text-sm">Loading your book...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#1a1510]">
                <div className="text-center space-y-4">
                    <p className="text-red-400">{error}</p>
                    <button onClick={() => router.back()} className="text-amber-200/60 hover:text-amber-200 text-sm underline">
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    const isPdf = book?.fileType === "PDF";

    // For non-PDF files, require text pages
    if (!isPdf && (!book || !book.pages?.length)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#1a1510]">
                <p className="text-amber-200/60">No pages found in this book.</p>
            </div>
        );
    }

    // For PDF files, require a signed URL
    if (isPdf && !book?.signedUrl) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#1a1510]">
                <p className="text-amber-200/60">PDF file URL not available.</p>
            </div>
        );
    }

    // ─── PDF MODE: full-viewport Heyzine-style (no header/footer) ───
    if (isPdf) {
        return (
            <div ref={containerRef} className="h-screen w-screen relative">
                <PdfFlipbookReader
                    bookId={bookId}
                    pdfUrl={book!.signedUrl!}
                    totalPages={book!.totalPages}
                    title={book!.title}
                    author={book!.author}
                    initialPage={savedPage > 0 ? savedPage : 1}
                    onFlip={playFlipSound}
                    soundEnabled={soundEnabled}
                    onToggleSound={toggleSound}
                    onBack={() => router.back()}
                />
                <AutoSaveProvider bookId={bookId} totalPages={book!.totalPages} />
            </div>
        );
    }

    // ─── TEXT MODE: existing dark layout with header/footer ───
    return (
        <div ref={containerRef} className="min-h-screen flex flex-col bg-[#1a1510]">
            <ReaderHeader title={book!.title} author={book!.author} />

            <main className="flex-1 relative">
                <FlipbookReader
                    pages={book!.pages}
                    initialPage={savedPage}
                    fontSize={fontSize}
                    onFlip={playFlipSound}
                />

                <AutoSaveProvider bookId={bookId} totalPages={book!.totalPages} />

                <ControlPanel
                    onToggleSound={toggleSound}
                    soundEnabled={soundEnabled}
                    onToggleFullscreen={toggleFullscreen}
                    isFullscreen={isFullscreen}
                    onFontSizeChange={handleFontSizeChange}
                    fontSize={fontSize}
                />
            </main>

            <ReaderFooter />
        </div>
    );
}

/** Listens to custom DOM events from FlipbookReader */
function ReaderHeader({ title, author }: { title: string; author: string | null }) {
    const router = useRouter();
    const [pageInfo, setPageInfo] = useState({ currentPage: 0, totalPages: 0 });

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setPageInfo({ currentPage: detail.currentPage, totalPages: detail.totalPages });
        };
        window.addEventListener("bookflow:pagechange", handler);
        return () => window.removeEventListener("bookflow:pagechange", handler);
    }, []);

    return (
        <header className="flex items-center justify-between px-4 py-2 bg-black/40 backdrop-blur-sm z-20">
            <button
                onClick={() => router.back()}
                className="text-white/60 hover:text-white transition-colors flex items-center gap-2 text-sm"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
            </button>
            <div className="text-center">
                <h1 className="text-white/80 text-sm font-medium truncate max-w-[300px]">{title}</h1>
                {author && <p className="text-white/40 text-xs">{author}</p>}
            </div>
            <div className="text-white/40 text-xs">
                {pageInfo.totalPages > 0 ? `Page ${pageInfo.currentPage + 1} of ${pageInfo.totalPages}` : ""}
            </div>
        </header>
    );
}

/** Progress bar — listens to custom events */
function ReaderFooter() {
    const [pageInfo, setPageInfo] = useState({ currentPage: 0, totalPages: 0 });

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setPageInfo({ currentPage: detail.currentPage, totalPages: detail.totalPages });
        };
        window.addEventListener("bookflow:pagechange", handler);
        return () => window.removeEventListener("bookflow:pagechange", handler);
    }, []);

    if (pageInfo.totalPages === 0) return null;

    const progress = ((pageInfo.currentPage + 1) / pageInfo.totalPages) * 100;

    return (
        <div className="px-4 py-3 bg-black/40 backdrop-blur-sm z-20">
            <div className="flex items-center gap-3 max-w-3xl mx-auto">
                <span className="text-white/40 text-xs font-mono min-w-[32px] text-right">
                    {pageInfo.currentPage + 1}
                </span>
                <div className="relative flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <span className="text-white/40 text-xs font-mono min-w-[32px]">
                    {pageInfo.totalPages}
                </span>
            </div>
            <div className="text-center mt-1">
                <span className="text-white/30 text-[10px]">{Math.round(progress)}% complete</span>
            </div>
        </div>
    );
}

/** Invisible component that activates auto-save */
function AutoSaveProvider({ bookId, totalPages }: { bookId: string; totalPages: number }) {
    useAutoSave({ bookId, totalPages });
    return null;
}
