"use client";

import { useState, useCallback, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────
interface SearchResult {
    source: "library" | "google" | "openlibrary";
    id: string;
    title: string;
    author?: string;
    coverUrl?: string;
    description?: string;
    publishedDate?: string;
    externalUrl?: string;
}

type SearchSource = "library" | "google" | "openlibrary";

// ── Main Component ─────────────────────────────────────────────────
export default function SearchPage() {
    const { accessToken } = useAuthStore();
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeSource, setActiveSource] = useState<SearchSource>("library");
    const [hasSearched, setHasSearched] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

    const performSearch = useCallback(
        async (searchQuery: string, source: SearchSource) => {
            if (!searchQuery.trim() || !accessToken) return;
            setLoading(true);
            setHasSearched(true);
            try {
                const res = await fetch(
                    `/api/search?q=${encodeURIComponent(searchQuery)}&source=${source}`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (res.ok) {
                    const { data } = await res.json();
                    setResults(data || []);
                }
            } catch {
                // silent
            } finally {
                setLoading(false);
            }
        },
        [accessToken]
    );

    const handleInputChange = (value: string) => {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (value.trim().length >= 2) {
            debounceRef.current = setTimeout(() => performSearch(value, activeSource), 400);
        } else {
            setResults([]);
            setHasSearched(false);
        }
    };

    const handleSourceChange = (source: SearchSource) => {
        setActiveSource(source);
        if (query.trim().length >= 2) {
            performSearch(query, source);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) performSearch(query, activeSource);
    };

    const sourceLabels: Record<SearchSource, { label: string; icon: string }> = {
        library: { label: "My Library", icon: "📚" },
        google: { label: "Google Books", icon: "🔍" },
        openlibrary: { label: "Open Library", icon: "🌐" },
    };

    return (
        <div className="min-h-screen">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                    <h1 className="text-2xl font-bold text-foreground">Search</h1>
                </div>

                {/* Search Bar */}
                <form onSubmit={handleSubmit} className="mb-6">
                    <div className="relative">
                        <svg
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                            xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.3-4.3" />
                        </svg>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => handleInputChange(e.target.value)}
                            placeholder="Search for books by title or author..."
                            className="w-full pl-12 pr-4 py-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-base"
                            autoFocus
                        />
                        {loading && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <div className="animate-spin w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
                            </div>
                        )}
                    </div>
                </form>

                {/* Source Tabs */}
                <div className="flex gap-2 mb-8">
                    {(Object.entries(sourceLabels) as [SearchSource, { label: string; icon: string }][]).map(
                        ([source, { label, icon }]) => (
                            <button
                                key={source}
                                onClick={() => handleSourceChange(source)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSource === source
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                                    }`}
                            >
                                {icon} {label}
                            </button>
                        )
                    )}
                </div>

                {/* Results */}
                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="animate-spin w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
                    </div>
                ) : results.length > 0 ? (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground mb-4">
                            {results.length} result{results.length !== 1 ? "s" : ""} found
                        </p>
                        {results.map((result) => (
                            <SearchResultCard key={`${result.source}-${result.id}`} result={result} />
                        ))}
                    </div>
                ) : hasSearched ? (
                    <div className="text-center py-16">
                        <div className="text-5xl mb-4">🔎</div>
                        <h3 className="text-foreground text-lg mb-2">No results found</h3>
                        <p className="text-muted-foreground text-sm">
                            Try a different search term or switch sources
                        </p>
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <div className="text-5xl mb-4">📖</div>
                        <h3 className="text-foreground text-lg mb-2">Search for books</h3>
                        <p className="text-muted-foreground text-sm max-w-md mx-auto">
                            Search your library, Google Books, or OpenLibrary to discover and manage your reading collection.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Search Result Card ─────────────────────────────────────────────
function SearchResultCard({ result }: { result: SearchResult }) {
    const sourceConfig: Record<string, { badge: string; color: string }> = {
        library: { badge: "Library", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
        google: { badge: "Google", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
        openlibrary: { badge: "OpenLibrary", color: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
    };

    const config = sourceConfig[result.source] || sourceConfig.library;

    // For external results, make the whole card clickable
    const handleCardClick = () => {
        if (result.source === "library") {
            window.location.href = `/reader/${result.id}`;
        } else if (result.externalUrl) {
            window.open(result.externalUrl, "_blank", "noopener,noreferrer");
        }
    };

    return (
        <div
            onClick={handleCardClick}
            className="bg-card border border-border rounded-xl p-4 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all group cursor-pointer"
        >
            <div className="flex gap-4">
                {/* Cover */}
                <div className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                    {result.coverUrl ? (
                        <img
                            src={result.coverUrl}
                            alt={result.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">📕</div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h3 className="text-foreground font-medium truncate group-hover:text-indigo-400 transition-colors">
                                {result.title}
                            </h3>
                            {result.author && (
                                <p className="text-muted-foreground text-sm mt-0.5 truncate">
                                    by {result.author}
                                </p>
                            )}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${config.color}`}>
                            {config.badge}
                        </span>
                    </div>

                    {result.description && (
                        <p className="text-muted-foreground text-xs mt-2 line-clamp-2">
                            {result.description}
                        </p>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                        {result.publishedDate && (
                            <span className="text-muted-foreground text-xs">
                                📅 {result.publishedDate}
                            </span>
                        )}
                        {result.source === "library" ? (
                            <span className="text-indigo-400 text-xs font-medium">
                                Read →
                            </span>
                        ) : (
                            <span className="text-indigo-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                View on {result.source === "google" ? "Google Books" : "OpenLibrary"} ↗
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
