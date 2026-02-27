"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface SmartScaleOptions {
    containerRef: React.RefObject<HTMLElement | null>;
    minScale?: number;
    maxScale?: number;
    defaultScale?: number;
}

interface SmartScaleState {
    scale: number;
    fontSize: string;
    lineHeight: string;
    containerWidth: string;
    margin: string;
}

/**
 * Smart Scale Mode — layout-based scaling (NOT CSS transform: scale()).
 * Recalculates font-size (rem), line-height, margins, and container width.
 * Supports: pinch gesture, double-click+drag, keyboard shortcuts (Ctrl+/-)
 */
export function useSmartScale({
    containerRef,
    minScale = 0.75,
    maxScale = 1.5,
    defaultScale = 1.0,
}: SmartScaleOptions) {
    const [scale, setScale] = useState(defaultScale);
    const lastDistance = useRef(0);
    const isDragging = useRef(false);
    const dragStartY = useRef(0);
    const dragStartScale = useRef(1);

    // Calculate layout values from scale
    const getLayoutValues = useCallback((s: number): SmartScaleState => {
        const baseFontSize = 18; // px
        const baseLineHeight = 1.65;
        const baseMaxWidth = 720; // px
        const baseMargin = 40; // px

        return {
            scale: s,
            fontSize: `${Math.round(baseFontSize * s)}px`,
            lineHeight: `${(baseLineHeight * (1 + (s - 1) * 0.3)).toFixed(2)}`,
            containerWidth: `${Math.round(baseMaxWidth * s)}px`,
            margin: `${Math.round(baseMargin * s)}px`,
        };
    }, []);

    const layout = getLayoutValues(scale);

    // Apply scale to CSS custom properties
    const applyScale = useCallback((s: number) => {
        const newScale = Math.max(minScale, Math.min(maxScale, s));
        setScale(newScale);

        if (containerRef.current) {
            const values = getLayoutValues(newScale);
            containerRef.current.style.setProperty("--reader-font-size", values.fontSize);
            containerRef.current.style.setProperty("--reader-line-height", values.lineHeight);
            containerRef.current.style.setProperty("--reader-max-width", values.containerWidth);
            containerRef.current.style.setProperty("--reader-margin", values.margin);
        }
    }, [containerRef, getLayoutValues, minScale, maxScale]);

    // Pinch gesture (trackpad)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = -e.deltaY * 0.005;
                applyScale(scale + delta);
            }
        };

        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => el.removeEventListener("wheel", handleWheel);
    }, [containerRef, scale, applyScale]);

    // Touch pinch gesture
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastDistance.current = Math.hypot(dx, dy);
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.hypot(dx, dy);

                if (lastDistance.current > 0) {
                    const delta = (distance - lastDistance.current) * 0.003;
                    applyScale(scale + delta);
                }
                lastDistance.current = distance;
            }
        };

        const handleTouchEnd = () => {
            lastDistance.current = 0;
        };

        el.addEventListener("touchstart", handleTouchStart, { passive: true });
        el.addEventListener("touchmove", handleTouchMove, { passive: false });
        el.addEventListener("touchend", handleTouchEnd, { passive: true });

        return () => {
            el.removeEventListener("touchstart", handleTouchStart);
            el.removeEventListener("touchmove", handleTouchMove);
            el.removeEventListener("touchend", handleTouchEnd);
        };
    }, [containerRef, scale, applyScale]);

    // Double-click + drag
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        let lastClick = 0;

        const handleMouseDown = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastClick < 300) {
                // Double-click detected — start drag scaling
                isDragging.current = true;
                dragStartY.current = e.clientY;
                dragStartScale.current = scale;
                e.preventDefault();
            }
            lastClick = now;
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging.current) {
                const delta = (dragStartY.current - e.clientY) * 0.003;
                applyScale(dragStartScale.current + delta);
            }
        };

        const handleMouseUp = () => {
            isDragging.current = false;
        };

        el.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            el.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [containerRef, scale, applyScale]);

    // Keyboard shortcuts (Ctrl++ / Ctrl+-)
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === "=" || e.key === "+") {
                    e.preventDefault();
                    applyScale(scale + 0.1);
                } else if (e.key === "-") {
                    e.preventDefault();
                    applyScale(scale - 0.1);
                } else if (e.key === "0") {
                    e.preventDefault();
                    applyScale(1.0);
                }
            }
        };

        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [scale, applyScale]);

    const resetScale = useCallback(() => applyScale(defaultScale), [applyScale, defaultScale]);

    return {
        scale,
        layout,
        setScale: applyScale,
        resetScale,
    };
}
