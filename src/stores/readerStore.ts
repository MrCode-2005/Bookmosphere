"use client";

import { create } from "zustand";

interface ReaderState {
    // Book state
    bookId: string | null;
    currentPage: number;
    totalPages: number;
    pages: string[]; // page content cache

    // UI state
    isFlipping: boolean;
    isFullscreen: boolean;
    isTOCOpen: boolean;
    isLoading: boolean;

    // Actions
    setBook: (bookId: string, totalPages: number) => void;
    setCurrentPage: (page: number) => void;
    setTotalPages: (total: number) => void;
    setPages: (pages: string[]) => void;
    setFlipping: (flipping: boolean) => void;
    setFullscreen: (fullscreen: boolean) => void;
    setTOCOpen: (open: boolean) => void;
    setLoading: (loading: boolean) => void;
    nextPage: () => void;
    prevPage: () => void;
    goToPage: (page: number) => void;
    reset: () => void;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
    bookId: null,
    currentPage: 1,
    totalPages: 0,
    pages: [],
    isFlipping: false,
    isFullscreen: false,
    isTOCOpen: false,
    isLoading: true,

    setBook: (bookId, totalPages) =>
        set({ bookId, totalPages, currentPage: 1, isLoading: false }),

    setCurrentPage: (page) => set({ currentPage: page }),

    setTotalPages: (total) => set({ totalPages: total }),

    setPages: (pages) => set({ pages }),

    setFlipping: (flipping) => set({ isFlipping: flipping }),

    setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

    setTOCOpen: (open) => set({ isTOCOpen: open }),

    setLoading: (loading) => set({ isLoading: loading }),

    nextPage: () => {
        const { currentPage, totalPages } = get();
        if (currentPage < totalPages) {
            set({ currentPage: currentPage + 1 });
        }
    },

    prevPage: () => {
        const { currentPage } = get();
        if (currentPage > 1) {
            set({ currentPage: currentPage - 1 });
        }
    },

    goToPage: (page) => {
        const { totalPages } = get();
        const clamped = Math.max(1, Math.min(page, totalPages));
        set({ currentPage: clamped });
    },

    reset: () =>
        set({
            bookId: null,
            currentPage: 1,
            totalPages: 0,
            pages: [],
            isFlipping: false,
            isFullscreen: false,
            isTOCOpen: false,
            isLoading: true,
        }),
}));
