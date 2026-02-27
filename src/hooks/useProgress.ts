"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";

interface AutoSaveOptions {
    bookId: string;
    totalPages: number;
    totalWords?: number;
    intervalMs?: number; // default 5000
}

/**
 * Hook that auto-saves reading progress every N seconds.
 * Listens to bookflow:pagechange events and debounce-saves to the API.
 */
export function useAutoSave({ bookId, totalPages, totalWords = 0, intervalMs = 5000 }: AutoSaveOptions) {
    const { accessToken } = useAuthStore();
    const currentPageRef = useRef(0);
    const sessionIdRef = useRef<string | null>(null);
    const sessionStartRef = useRef(Date.now());
    const pagesReadRef = useRef(0);
    const lastSavedPageRef = useRef(-1);
    const accessTokenRef = useRef(accessToken);

    // Keep token ref in sync
    useEffect(() => {
        accessTokenRef.current = accessToken;
    }, [accessToken]);

    // Avg words per page for estimation
    const wordsPerPage = totalPages > 0 && totalWords > 0 ? Math.round(totalWords / totalPages) : 250;

    // Listen to page change events
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const prevPage = currentPageRef.current;
            currentPageRef.current = detail.currentPage;

            // Track pages read
            if (detail.currentPage !== prevPage) {
                pagesReadRef.current += 1;
            }
        };
        window.addEventListener("bookflow:pagechange", handler);
        return () => window.removeEventListener("bookflow:pagechange", handler);
    }, []);

    // Save progress + update session
    const saveProgress = useCallback(async () => {
        const token = accessTokenRef.current;
        if (!token || !bookId) return;

        const percentage = totalPages > 0
            ? ((currentPageRef.current + 1) / totalPages) * 100
            : 0;

        // Save page progress
        if (currentPageRef.current !== lastSavedPageRef.current) {
            try {
                await fetch(`/api/progress/${bookId}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        currentPage: currentPageRef.current,
                        percentage: Math.min(100, Math.round(percentage)),
                    }),
                });
                lastSavedPageRef.current = currentPageRef.current;
            } catch {
                // Silently fail — will retry on next interval
            }
        }

        // Update reading session with accumulated stats
        if (sessionIdRef.current) {
            const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
            const estimatedWords = pagesReadRef.current * wordsPerPage;
            try {
                await fetch("/api/sessions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        sessionId: sessionIdRef.current,
                        pagesRead: pagesReadRef.current,
                        wordsRead: estimatedWords,
                        duration,
                    }),
                });
            } catch {
                // Will retry next interval
            }
        }
    }, [bookId, totalPages, wordsPerPage]);

    // Start a reading session
    useEffect(() => {
        if (!accessToken || !bookId) return;

        const startSession = async () => {
            try {
                const res = await fetch("/api/sessions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ bookId }),
                });
                const data = await res.json();
                sessionIdRef.current = data.session?.id || null;
                sessionStartRef.current = Date.now();
            } catch {
                // Ignore
            }
        };

        startSession();

        // End session on unmount — use fetch with keepalive for auth headers
        return () => {
            if (sessionIdRef.current && accessTokenRef.current) {
                const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
                const estimatedWords = pagesReadRef.current * wordsPerPage;
                try {
                    fetch("/api/sessions", {
                        method: "POST",
                        keepalive: true,
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${accessTokenRef.current}`,
                        },
                        body: JSON.stringify({
                            sessionId: sessionIdRef.current,
                            pagesRead: pagesReadRef.current,
                            wordsRead: estimatedWords,
                            duration,
                            endSession: true,
                        }),
                    });
                } catch {
                    // Best effort
                }
            }
        };
    }, [accessToken, bookId, wordsPerPage]);

    // Auto-save interval (progress + session)
    useEffect(() => {
        const interval = setInterval(saveProgress, intervalMs);
        return () => clearInterval(interval);
    }, [saveProgress, intervalMs]);

    // Save on page visibility change (tab switch / window close)
    useEffect(() => {
        const handler = () => {
            if (document.hidden) saveProgress();
        };
        document.addEventListener("visibilitychange", handler);
        return () => document.removeEventListener("visibilitychange", handler);
    }, [saveProgress]);

    return { saveProgress };
}

/**
 * Fetch saved reading progress for a book
 */
export async function fetchProgress(
    bookId: string,
    accessToken: string
): Promise<{ currentPage: number; percentage: number } | null> {
    try {
        const res = await fetch(`/api/progress/${bookId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.progress || null;
    } catch {
        return null;
    }
}
