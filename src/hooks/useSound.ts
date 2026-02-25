"use client";

import { useRef, useCallback, useEffect, useState } from "react";

/**
 * Hook for page-flip sound effect.
 * Uses a real MP3 file for authentic paper-turn sound.
 */
export function usePageFlipSound() {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [enabled, setEnabled] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("bookflow:sound") !== "off";
        }
        return true;
    });

    // Load the real MP3 sound file
    useEffect(() => {
        const audio = new Audio("/sounds/page-flip.mp3");
        audio.preload = "auto";
        audioRef.current = audio;

        return () => {
            audioRef.current = null;
        };
    }, []);

    // Persist preference
    useEffect(() => {
        localStorage.setItem("bookflow:sound", enabled ? "on" : "off");
    }, [enabled]);

    const play = useCallback(() => {
        if (!enabled || !audioRef.current) return;

        try {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => { }); // Ignore autoplay prevention
        } catch {
            // Ignore playback errors
        }
    }, [enabled]);

    const toggle = useCallback(() => {
        setEnabled((prev) => !prev);
    }, []);

    return { play, enabled, toggle };
}
