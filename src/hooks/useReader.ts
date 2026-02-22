"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReaderStore } from "@/stores/readerStore";
import { useAuthStore } from "@/stores/authStore";

export function useReader(bookId: string) {
    const store = useReaderStore();
    const { accessToken } = useAuthStore();
    const flipBookRef = useRef<unknown>(null);

    // Load book data
    const loadBook = useCallback(async () => {
        if (!bookId || !accessToken) return;

        store.setLoading(true);
        try {
            const res = await fetch(`/api/books/${bookId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!res.ok) throw new Error("Failed to load book");

            const { data } = await res.json();
            store.setBook(bookId, data.totalPages);

            // Load saved progress
            const progressRes = await fetch(`/api/progress/${bookId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (progressRes.ok) {
                const { data: progress } = await progressRes.json();
                if (progress?.currentPage) {
                    store.setCurrentPage(progress.currentPage);
                }
            }
        } catch (err) {
            console.error("Failed to load book:", err);
        } finally {
            store.setLoading(false);
        }
    }, [bookId, accessToken]);

    // Toggle fullscreen
    const toggleFullscreen = useCallback(async () => {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
            store.setFullscreen(true);
        } else {
            await document.exitFullscreen();
            store.setFullscreen(false);
        }
    }, []);

    // Listen for fullscreen changes
    useEffect(() => {
        const handler = () => {
            store.setFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    return {
        ...store,
        flipBookRef,
        loadBook,
        toggleFullscreen,
    };
}
