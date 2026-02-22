"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/themeStore";
import { useAuthStore } from "@/stores/authStore";

export function useTheme() {
    const themeStore = useThemeStore();
    const { accessToken } = useAuthStore();

    // Apply theme on mount
    useEffect(() => {
        themeStore.applyToCSS();
    }, []);

    // Load preferences from server
    const loadPreferences = async () => {
        if (!accessToken) return;
        try {
            const res = await fetch("/api/preferences", {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (res.ok) {
                const { data } = await res.json();
                themeStore.loadFromPreferences(data);
            }
        } catch (err) {
            console.error("Failed to load preferences:", err);
        }
    };

    // Save preferences to server
    const savePreferences = async () => {
        if (!accessToken) return;
        try {
            await fetch("/api/preferences", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    theme: themeStore.theme,
                    primaryColor: themeStore.primaryColor,
                    fontFamily: themeStore.fontFamily,
                    fontSize: themeStore.fontSize,
                    lineSpacing: themeStore.lineSpacing,
                    marginSize: themeStore.marginSize,
                    bgTexture: themeStore.bgTexture,
                    animSpeed: themeStore.animSpeed,
                    flipSound: themeStore.flipSound,
                    flipVolume: themeStore.flipVolume,
                    shadowIntensity: themeStore.shadowIntensity,
                }),
            });
        } catch (err) {
            console.error("Failed to save preferences:", err);
        }
    };

    return {
        ...themeStore,
        loadPreferences,
        savePreferences,
    };
}
