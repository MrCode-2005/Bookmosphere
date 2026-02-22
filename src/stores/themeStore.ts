"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeMode } from "@/types";

interface ThemeState {
    theme: ThemeMode;
    primaryColor: string;
    fontFamily: string;
    fontSize: number;
    lineSpacing: number;
    marginSize: number;
    bgTexture: string;
    animSpeed: number;
    flipSound: boolean;
    flipVolume: number;
    shadowIntensity: number;

    // Actions
    setTheme: (theme: ThemeMode) => void;
    setPrimaryColor: (color: string) => void;
    setFontFamily: (font: string) => void;
    setFontSize: (size: number) => void;
    setLineSpacing: (spacing: number) => void;
    setMarginSize: (margin: number) => void;
    setBgTexture: (texture: string) => void;
    setAnimSpeed: (speed: number) => void;
    setFlipSound: (enabled: boolean) => void;
    setFlipVolume: (volume: number) => void;
    setShadowIntensity: (intensity: number) => void;
    applyToCSS: () => void;
    loadFromPreferences: (prefs: Partial<ThemeState>) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: "dark",
            primaryColor: "#6366F1",
            fontFamily: "Inter",
            fontSize: 16,
            lineSpacing: 1.6,
            marginSize: 40,
            bgTexture: "none",
            animSpeed: 1.0,
            flipSound: true,
            flipVolume: 0.5,
            shadowIntensity: 0.5,

            setTheme: (theme) => { set({ theme }); get().applyToCSS(); },
            setPrimaryColor: (primaryColor) => { set({ primaryColor }); get().applyToCSS(); },
            setFontFamily: (fontFamily) => { set({ fontFamily }); get().applyToCSS(); },
            setFontSize: (fontSize) => { set({ fontSize }); get().applyToCSS(); },
            setLineSpacing: (lineSpacing) => { set({ lineSpacing }); get().applyToCSS(); },
            setMarginSize: (marginSize) => { set({ marginSize }); get().applyToCSS(); },
            setBgTexture: (bgTexture) => { set({ bgTexture }); get().applyToCSS(); },
            setAnimSpeed: (animSpeed) => set({ animSpeed }),
            setFlipSound: (flipSound) => set({ flipSound }),
            setFlipVolume: (flipVolume) => set({ flipVolume }),
            setShadowIntensity: (shadowIntensity) => { set({ shadowIntensity }); get().applyToCSS(); },

            applyToCSS: () => {
                if (typeof document === "undefined") return;
                const state = get();
                const root = document.documentElement;

                // Theme mode
                root.classList.remove("light", "dark", "sepia");
                root.classList.add(state.theme);

                // CSS custom properties
                root.style.setProperty("--bf-primary", state.primaryColor);
                root.style.setProperty("--bf-font-family", state.fontFamily);
                root.style.setProperty("--bf-font-size", `${state.fontSize}px`);
                root.style.setProperty("--bf-line-spacing", `${state.lineSpacing}`);
                root.style.setProperty("--bf-margin", `${state.marginSize}px`);
                root.style.setProperty("--bf-shadow-intensity", `${state.shadowIntensity}`);
            },

            loadFromPreferences: (prefs) => {
                set(prefs);
                get().applyToCSS();
            },
        }),
        {
            name: "bookflow-theme",
        }
    )
);
