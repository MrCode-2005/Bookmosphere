"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

interface BookItem {
    id: string;
    title: string;
    author: string | null;
    totalPages: number;
    totalWords: number;
    fileType: string;
    status: string;
    createdAt: string;
}

export default function LibraryPage() {
    const router = useRouter();
    const { accessToken } = useAuthStore();
    const [books, setBooks] = useState<BookItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [uploadProgress, setUploadProgress] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchBooks = useCallback(async () => {
        if (!accessToken) return;
        try {
            const res = await fetch("/api/books", {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                setBooks(data.data || data.books || []);
            }
        } catch {
            // Ignore
        } finally {
            setLoading(false);
        }
    }, [accessToken]);

    useEffect(() => {
        fetchBooks();
    }, [fetchBooks]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !accessToken) return;

        setUploading(true);
        setUploadProgress("Preparing upload...");

        try {
            // Step 1: Get signed upload URL
            const initRes = await fetch("/api/books/upload", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                }),
            });

            const initData = await initRes.json();
            if (!initRes.ok || !initData.success) {
                throw new Error(initData.error || "Upload init failed");
            }

            // Step 2: Upload directly to Supabase
            setUploadProgress("Uploading file...");
            const uploadRes = await fetch(initData.uploadUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": file.type || "application/octet-stream",
                },
                body: file,
            });

            if (!uploadRes.ok) {
                throw new Error("Failed to upload file");
            }

            // Step 3: Confirm and process
            setUploadProgress("Processing book...");
            const confirmRes = await fetch("/api/books/upload/confirm", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    bookId: initData.bookId,
                    storageKey: initData.storageKey,
                }),
            });

            if (confirmRes.ok) {
                setTimeout(() => {
                    fetchBooks();
                    setUploading(false);
                    setShowUpload(false);
                    setUploadProgress("");
                }, 2000);
            } else {
                const data = await confirmRes.json();
                throw new Error(data.error || "Processing failed");
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Upload failed";
            setUploadProgress(`Error: ${msg}`);
            setTimeout(() => {
                setUploading(false);
                setUploadProgress("");
            }, 3000);
        }

        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleDelete = async (bookId: string) => {
        if (!accessToken) return;
        if (!confirm("Delete this book? This action cannot be undone.")) return;

        try {
            const res = await fetch(`/api/books/${bookId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (res.ok) {
                setBooks((prev) => prev.filter((b) => b.id !== bookId));
            }
        } catch {
            // Ignore
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <h1 className="text-2xl font-bold text-foreground">My Library</h1>
                        <span className="text-muted-foreground text-sm">{books.length} book{books.length !== 1 ? "s" : ""}</span>
                    </div>
                    <button
                        onClick={() => setShowUpload(true)}
                        className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Upload Book
                    </button>
                </div>

                {/* Upload Modal */}
                {showUpload && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
                            <h2 className="text-xl font-bold text-foreground mb-2">Upload a Book</h2>
                            <p className="text-muted-foreground text-sm mb-6">
                                Supported formats: TXT, PDF, EPUB, DOCX
                            </p>

                            {uploading ? (
                                <div className="text-center py-8">
                                    <div className="animate-spin w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full mx-auto mb-4" />
                                    <p className="text-muted-foreground text-sm">{uploadProgress}</p>
                                </div>
                            ) : (
                                <label className="block">
                                    <div className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 transition-colors group">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-muted-foreground group-hover:text-indigo-500 transition-colors">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="17 8 12 3 7 8" />
                                            <line x1="12" y1="3" x2="12" y2="15" />
                                        </svg>
                                        <p className="text-muted-foreground text-sm group-hover:text-foreground transition-colors">
                                            Click to select a file or drag and drop
                                        </p>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".txt,.pdf,.epub,.docx"
                                        onChange={handleUpload}
                                        className="hidden"
                                    />
                                </label>
                            )}

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => {
                                        setShowUpload(false);
                                        setUploading(false);
                                        setUploadProgress("");
                                    }}
                                    className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Book Grid */}
                {books.length === 0 ? (
                    <div className="bg-muted/30 border border-border rounded-2xl p-16 text-center">
                        <div className="text-6xl mb-6">📚</div>
                        <h3 className="text-foreground text-xl mb-3">Your library is empty</h3>
                        <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
                            Upload your first book to start your immersive reading experience with page-turning animations and progress tracking.
                        </p>
                        <button
                            onClick={() => setShowUpload(true)}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors"
                        >
                            Upload Your First Book
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                        {books.map((book) => (
                            <div key={book.id} className="group relative">
                                <button
                                    onClick={() => {
                                        if (book.status === "READY") router.push(`/reader/${book.id}`);
                                    }}
                                    disabled={book.status !== "READY"}
                                    className="w-full bg-card border border-border rounded-xl overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="aspect-[3/4] bg-gradient-to-br from-indigo-100 to-purple-50 flex items-center justify-center relative">
                                        <span className="text-4xl opacity-60">📖</span>
                                        {book.status === "PROCESSING" && (
                                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                                <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
                                            </div>
                                        )}
                                        {book.status === "FAILED" && (
                                            <div className="absolute inset-0 bg-red-100/60 flex items-center justify-center">
                                                <span className="text-red-600 text-xs font-medium">Failed</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <h3 className="text-foreground text-sm font-medium truncate group-hover:text-indigo-600 transition-colors">
                                            {book.title}
                                        </h3>
                                        {book.author && (
                                            <p className="text-muted-foreground text-xs truncate mt-0.5">{book.author}</p>
                                        )}
                                        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                                            <span>{book.totalPages} pages</span>
                                            <span>·</span>
                                            <span>{book.fileType}</span>
                                        </div>
                                    </div>
                                </button>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(book.id);
                                    }}
                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 text-white/60 hover:text-red-400 hover:bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                    title="Delete book"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
