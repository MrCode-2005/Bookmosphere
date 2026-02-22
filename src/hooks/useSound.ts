"use client";

import { useRef, useCallback, useEffect, useState } from "react";

/**
 * Hook for page-flip sound effect.
 * Uses Web Audio API for low-latency playback.
 */
export function usePageFlipSound() {
    const audioContextRef = useRef<AudioContext | null>(null);
    const bufferRef = useRef<AudioBuffer | null>(null);
    const [enabled, setEnabled] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("bookflow:sound") !== "off";
        }
        return true;
    });

    // Load sound effect
    useEffect(() => {
        const loadSound = async () => {
            try {
                const ctx = new AudioContext();
                audioContextRef.current = ctx;

                // Generate a synthetic page-flip sound (short noise burst)
                const sampleRate = ctx.sampleRate;
                const duration = 0.15; // 150ms
                const length = sampleRate * duration;
                const buffer = ctx.createBuffer(1, length, sampleRate);
                const data = buffer.getChannelData(0);

                for (let i = 0; i < length; i++) {
                    const t = i / sampleRate;
                    // Quick fade in + slow fade out (envelope)
                    const envelope = Math.min(t / 0.005, 1) * Math.exp(-t * 25);
                    // Filtered noise
                    data[i] = (Math.random() * 2 - 1) * envelope * 0.3;
                }

                bufferRef.current = buffer;
            } catch {
                // Web Audio not supported
            }
        };

        loadSound();

        return () => {
            audioContextRef.current?.close();
        };
    }, []);

    // Persist preference
    useEffect(() => {
        localStorage.setItem("bookflow:sound", enabled ? "on" : "off");
    }, [enabled]);

    const play = useCallback(() => {
        if (!enabled || !audioContextRef.current || !bufferRef.current) return;

        try {
            const ctx = audioContextRef.current;
            if (ctx.state === "suspended") ctx.resume();

            const source = ctx.createBufferSource();
            source.buffer = bufferRef.current;

            // Add a bit of randomization for naturalness
            source.playbackRate.value = 0.9 + Math.random() * 0.2;

            const gain = ctx.createGain();
            gain.gain.value = 0.4;

            source.connect(gain);
            gain.connect(ctx.destination);
            source.start();
        } catch {
            // Ignore playback errors
        }
    }, [enabled]);

    const toggle = useCallback(() => {
        setEnabled((prev) => !prev);
    }, []);

    return { play, enabled, toggle };
}
