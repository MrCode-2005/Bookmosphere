"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import Link from "next/link";

interface BookItem {
    id: string;
    title: string;
    author: string | null;
    totalPages: number;
    totalWords: number;
    coverUrl: string | null;
    status: string;
    createdAt: string;
}

interface ProgressItem {
    bookId: string;
    currentPage: number;
    percentage: number;
    updatedAt: string;
}

interface SessionItem {
    bookId: string;
    duration: number;
    pagesRead: number;
    startedAt: string;
}

export default function DashboardPage() {
    const router = useRouter();
    const { accessToken, user } = useAuthStore();
    const [books, setBooks] = useState<BookItem[]>([]);
    const [progressMap, setProgressMap] = useState<Record<string, ProgressItem>>({});
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!accessToken) return;

        const fetchData = async () => {
            try {
                const [booksRes, sessionsRes] = await Promise.all([
                    fetch("/api/books", { headers: { Authorization: `Bearer ${accessToken}` } }),
                    fetch("/api/sessions", { headers: { Authorization: `Bearer ${accessToken}` } }),
                ]);

                if (booksRes.ok) {
                    const data = await booksRes.json();
                    setBooks(data.books || []);

                    const progressPromises = (data.books || []).map(async (b: BookItem) => {
                        const res = await fetch(`/api/progress/${b.id}`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        });
                        if (res.ok) {
                            const d = await res.json();
                            return d.progress;
                        }
                        return null;
                    });
                    const progresses = await Promise.all(progressPromises);
                    const map: Record<string, ProgressItem> = {};
                    progresses.forEach((p: ProgressItem | null) => {
                        if (p) map[p.bookId] = p;
                    });
                    setProgressMap(map);
                }

                if (sessionsRes.ok) {
                    const d = await sessionsRes.json();
                    setSessions(d.sessions || []);
                }
            } catch {
                // Silently fail
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [accessToken]);

    const totalBooksRead = books.filter((b) => {
        const p = progressMap[b.id];
        return p && p.percentage >= 100;
    }).length;

    const totalReadingTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalPagesRead = sessions.reduce((sum, s) => sum + (s.pagesRead || 0), 0);

    const lastReadProgress = Object.values(progressMap).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
    const lastReadBook = lastReadProgress
        ? books.find((b) => b.id === lastReadProgress.bookId)
        : null;

    const readyBooks = books.filter((b) => b.status === "READY");

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
                <div className="flex items-center justify-between mb-10">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Welcome back{user?.name ? `, ${user.name}` : ""}
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">Your reading dashboard</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/settings"
                            className="px-4 py-2 rounded-lg border border-border hover:bg-card text-foreground text-sm font-medium transition-colors"
                        >
                            ⚙️ Settings
                        </Link>
                        <Link
                            href="/search"
                            className="px-4 py-2 rounded-lg border border-border hover:bg-card text-foreground text-sm font-medium transition-colors"
                        >
                            🔍 Search
                        </Link>
                        <Link
                            href="/analytics"
                            className="px-4 py-2 rounded-lg border border-border hover:bg-card text-foreground text-sm font-medium transition-colors"
                        >
                            📊 Analytics
                        </Link>
                        <Link
                            href="/library"
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                        >
                            My Library →
                        </Link>
                    </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    <StatCard label="Books" value={books.length} icon="📚" color="bg-indigo-50 border-indigo-200" />
                    <StatCard label="Completed" value={totalBooksRead} icon="✅" color="bg-emerald-50 border-emerald-200" />
                    <StatCard label="Pages Read" value={totalPagesRead} icon="📖" color="bg-amber-50 border-amber-200" />
                    <StatCard label="Reading Time" value={formatDuration(totalReadingTime)} icon="⏱️" color="bg-purple-50 border-purple-200" />
                </div>

                {/* Resume Reading */}
                {lastReadBook && lastReadProgress && (
                    <div className="mb-10">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Continue Reading</h2>
                        <button
                            onClick={() => router.push(`/reader/${lastReadBook.id}`)}
                            className="w-full md:w-auto bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-5 hover:border-indigo-400 transition-all text-left group shadow-sm"
                        >
                            <div className="flex items-center gap-5">
                                <div className="w-16 h-20 bg-gradient-to-br from-indigo-200 to-purple-200 rounded-lg flex items-center justify-center text-2xl shrink-0">
                                    📖
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-foreground font-medium truncate group-hover:text-indigo-600 transition-colors">
                                        {lastReadBook.title}
                                    </h3>
                                    {lastReadBook.author && (
                                        <p className="text-muted-foreground text-sm">{lastReadBook.author}</p>
                                    )}
                                    <div className="mt-2 flex items-center gap-3">
                                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-[200px]">
                                            <div
                                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                                                style={{ width: `${Math.min(100, lastReadProgress.percentage)}%` }}
                                            />
                                        </div>
                                        <span className="text-muted-foreground text-xs">
                                            {Math.round(lastReadProgress.percentage)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="text-gray-400 group-hover:text-indigo-500 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                </div>
                            </div>
                        </button>
                    </div>
                )}

                {/* Your Books */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground">Your Books</h2>
                        <Link href="/library" className="text-indigo-600 hover:text-indigo-500 text-sm transition-colors">
                            View all →
                        </Link>
                    </div>

                    {readyBooks.length === 0 ? (
                        <div className="bg-muted/50 border border-border rounded-xl p-12 text-center">
                            <div className="text-5xl mb-4">📚</div>
                            <h3 className="text-foreground text-lg mb-2">No books yet</h3>
                            <p className="text-muted-foreground text-sm mb-6">Upload your first book to start reading</p>
                            <Link
                                href="/library"
                                className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm font-medium transition-colors"
                            >
                                Upload a Book
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {readyBooks.slice(0, 10).map((book) => (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    progress={progressMap[book.id]}
                                    onClick={() => router.push(`/reader/${book.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
    return (
        <div className={`${color} border rounded-xl p-4 hover:shadow-md transition-all`}>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{icon}</span>
                <span className="text-gray-600 text-xs uppercase tracking-wider font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
    );
}

function BookCard({
    book,
    progress,
    onClick,
}: {
    book: BookItem;
    progress?: ProgressItem;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="group bg-card border border-border rounded-xl overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all text-left"
        >
            <div className="aspect-[3/4] bg-gradient-to-br from-indigo-100 to-purple-50 flex items-center justify-center relative">
                <span className="text-4xl opacity-60">📖</span>
                {progress && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                            style={{ width: `${Math.min(100, progress.percentage)}%` }}
                        />
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
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-muted-foreground text-[10px]">{book.totalPages} pages</span>
                    {progress && (
                        <span className="text-indigo-600 text-[10px]">
                            {Math.round(progress.percentage)}%
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}
