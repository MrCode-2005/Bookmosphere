"use client";

import { create } from "zustand";
import type { BookWithProgress } from "@/types";

interface BookState {
    books: BookWithProgress[];
    selectedBook: BookWithProgress | null;
    isUploading: boolean;
    uploadProgress: number;
    searchQuery: string;

    // Actions
    setBooks: (books: BookWithProgress[]) => void;
    addBook: (book: BookWithProgress) => void;
    removeBook: (bookId: string) => void;
    selectBook: (book: BookWithProgress | null) => void;
    setUploading: (uploading: boolean) => void;
    setUploadProgress: (progress: number) => void;
    setSearchQuery: (query: string) => void;
    updateBookStatus: (bookId: string, status: "PROCESSING" | "READY" | "FAILED") => void;
}

export const useBookStore = create<BookState>((set, get) => ({
    books: [],
    selectedBook: null,
    isUploading: false,
    uploadProgress: 0,
    searchQuery: "",

    setBooks: (books) => set({ books }),

    addBook: (book) => set({ books: [book, ...get().books] }),

    removeBook: (bookId) =>
        set({ books: get().books.filter((b) => b.id !== bookId) }),

    selectBook: (book) => set({ selectedBook: book }),

    setUploading: (uploading) => set({ isUploading: uploading }),

    setUploadProgress: (progress) => set({ uploadProgress: progress }),

    setSearchQuery: (query) => set({ searchQuery: query }),

    updateBookStatus: (bookId, status) =>
        set({
            books: get().books.map((b) =>
                b.id === bookId ? { ...b, status } : b
            ),
        }),
}));
