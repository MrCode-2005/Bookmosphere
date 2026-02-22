// ═══════════════════════════════════════
// BookFlow — Type Definitions
// ═══════════════════════════════════════

import type { Book, Bookmark, Highlight, ReadingProgress, UserPreferences, User } from "@prisma/client";

// ─── Auth ───
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface JWTPayload {
    userId: string;
    email: string;
    role: "USER" | "ADMIN";
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    name: string;
}

// ─── User ───
export type SafeUser = Omit<User, "passwordHash">;

// ─── Book ───
export interface BookWithProgress extends Book {
    progress?: ReadingProgress | null;
}

export interface BookUploadResponse {
    book: Book;
    message: string;
}

export interface ParsedBookData {
    title: string;
    author?: string;
    totalPages: number;
    totalWords: number;
    pages: ParsedPage[];
    toc?: TOCItem[];
    coverUrl?: string;
    metadata?: Record<string, unknown>;
}

export interface ParsedPage {
    pageNumber: number;
    content: string;
    wordCount: number;
}

export interface TOCItem {
    title: string;
    pageNumber: number;
    level: number;
    children?: TOCItem[];
}

// ─── Reader ───
export interface ReaderState {
    bookId: string | null;
    currentPage: number;
    totalPages: number;
    isFlipping: boolean;
    isFullscreen: boolean;
    isSoundEnabled: boolean;
    volume: number;
    zoom: number;
}

// ─── Analytics ───
export interface ReadingStats {
    totalReadingTime: number; // seconds
    pagesPerDay: number;
    wordsPerDay: number;
    booksCompleted: number;
    readingStreak: number;
    averageSessionDuration: number; // seconds
    completionPercentage: number;
}

export interface DailyReadingData {
    date: string;
    pagesRead: number;
    wordsRead: number;
    timeSpent: number; // seconds
}

export interface HeatmapData {
    date: string;
    count: number; // reading sessions or minutes
}

// ─── Search ───
export interface SearchResult {
    source: "library" | "google" | "openlibrary";
    id: string;
    title: string;
    author?: string;
    coverUrl?: string;
    description?: string;
    publishedDate?: string;
    downloadUrl?: string;
}

// ─── API Response ───
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// ─── Preferences (for client-side) ───
export type ThemeMode = "light" | "dark" | "sepia";

export interface ThemePreferences extends Omit<UserPreferences, "id" | "userId"> { }

// Re-export Prisma types for convenience
export type {
    Book,
    Bookmark,
    Highlight,
    ReadingProgress,
    UserPreferences,
    User,
};
