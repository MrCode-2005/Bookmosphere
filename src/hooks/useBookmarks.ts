"use client";

import { useState, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import type { Bookmark } from "@/types";

export function useBookmarks(bookId: string) {
    const { accessToken } = useAuthStore();
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
    };

    const fetchBookmarks = useCallback(async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/bookmarks?bookId=${bookId}`, { headers });
            if (res.ok) {
                const { data } = await res.json();
                setBookmarks(data || []);
            }
        } catch (err) {
            console.error("Failed to fetch bookmarks:", err);
        } finally {
            setIsLoading(false);
        }
    }, [bookId, accessToken]);

    const addBookmark = useCallback(
        async (pageNumber: number, wordIndex?: number, note?: string, color?: string) => {
            try {
                const res = await fetch("/api/bookmarks", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ bookId, pageNumber, wordIndex, note, color }),
                });
                if (res.ok) {
                    const { data } = await res.json();
                    setBookmarks((prev) => [...prev, data]);
                    return data;
                }
            } catch (err) {
                console.error("Failed to add bookmark:", err);
            }
        },
        [bookId, accessToken]
    );

    const removeBookmark = useCallback(
        async (bookmarkId: string) => {
            try {
                await fetch(`/api/bookmarks?id=${bookmarkId}`, {
                    method: "DELETE",
                    headers,
                });
                setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
            } catch (err) {
                console.error("Failed to remove bookmark:", err);
            }
        },
        [accessToken]
    );

    return {
        bookmarks,
        isLoading,
        fetchBookmarks,
        addBookmark,
        removeBookmark,
    };
}
