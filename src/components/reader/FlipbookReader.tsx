"use client";

import React, { useState, useCallback, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BookPage {
    pageNumber: number;
    content: string;
}

interface FlipbookReaderProps {
    pages: BookPage[];
    initialPage?: number;
    fontSize?: number;
    fontFamily?: string;
    lineSpacing?: number;
    onFlip?: () => void;
}

/** Dispatch a custom event so other UI elements (header, slider) can track page changes */
function emitPageChange(currentPage: number, totalPages: number) {
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent("bookflow:pagechange", {
                detail: { currentPage, totalPages },
            })
        );
    }
}

export default function FlipbookReader({
    pages,
    initialPage = 0,
    fontSize = 16,
    fontFamily = "Georgia, serif",
    lineSpacing = 1.8,
    onFlip,
}: FlipbookReaderProps) {
    const [spreadIndex, setSpreadIndex] = useState(Math.floor(initialPage / 2));
    const [flipDirection, setFlipDirection] = useState<"left" | "right">("right");
    const [isFlipping, setIsFlipping] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const totalSpreads = Math.ceil(pages.length / 2);

    // Emit initial page info after mount
    React.useEffect(() => {
        emitPageChange(spreadIndex * 2, pages.length);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const goNext = useCallback(() => {
        if (isFlipping || spreadIndex >= totalSpreads - 1) return;
        setFlipDirection("right");
        setIsFlipping(true);
        const next = spreadIndex + 1;
        onFlip?.();
        setTimeout(() => {
            setSpreadIndex(next);
            setIsFlipping(false);
            emitPageChange(next * 2, pages.length);
        }, 400);
    }, [isFlipping, spreadIndex, totalSpreads, pages.length]);

    const goPrev = useCallback(() => {
        if (isFlipping || spreadIndex <= 0) return;
        setFlipDirection("left");
        setIsFlipping(true);
        const prev = spreadIndex - 1;
        onFlip?.();
        setTimeout(() => {
            setSpreadIndex(prev);
            setIsFlipping(false);
            emitPageChange(prev * 2, pages.length);
        }, 400);
    }, [isFlipping, spreadIndex, pages.length]);

    // Keyboard navigation
    useLayoutEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            switch (e.key) {
                case "ArrowRight":
                case " ":
                    e.preventDefault();
                    goNext();
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    goPrev();
                    break;
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [goNext, goPrev]);

    // Touch / swipe
    const touchStartX = useRef(0);
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: React.TouchEvent) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            diff > 0 ? goNext() : goPrev();
        }
    };

    const leftPage = pages[spreadIndex * 2] || null;
    const rightPage = pages[spreadIndex * 2 + 1] || null;

    return (
        <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center relative overflow-hidden select-none"
            style={{
                background:
                    "radial-gradient(ellipse at center, #2a2520 0%, #1a1510 70%, #0f0d0a 100%)",
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Ambient glow */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(ellipse at center, rgba(255,220,150,0.03) 0%, transparent 60%)",
                }}
            />

            {/* Book */}
            <div className="relative flex" style={{ perspective: "2000px" }}>
                <div
                    className="absolute -inset-4 rounded-lg pointer-events-none"
                    style={{
                        boxShadow:
                            "0 20px 60px rgba(0,0,0,0.6), 0 8px 20px rgba(0,0,0,0.4)",
                    }}
                />

                <AnimatePresence mode="wait">
                    <motion.div
                        key={spreadIndex}
                        className="flex"
                        initial={{
                            rotateY: flipDirection === "right" ? 3 : -3,
                            opacity: 0.7,
                            scale: 0.98,
                        }}
                        animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                        exit={{
                            rotateY: flipDirection === "right" ? -3 : 3,
                            opacity: 0.7,
                            scale: 0.98,
                        }}
                        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                    >
                        {/* Left page */}
                        <div
                            className="relative"
                            style={{
                                width: "min(480px, 45vw)",
                                height: "min(680px, 82vh)",
                            }}
                        >
                            {leftPage ? (
                                <Page
                                    page={leftPage}
                                    totalPages={pages.length}
                                    side="left"
                                    fontSize={fontSize}
                                    fontFamily={fontFamily}
                                    lineSpacing={lineSpacing}
                                />
                            ) : (
                                <EmptyPage side="left" />
                            )}
                        </div>

                        {/* Spine */}
                        <div
                            className="relative z-10"
                            style={{
                                width: "6px",
                                background:
                                    "linear-gradient(to right, #3d3530, #2a2420, #3d3530)",
                                boxShadow:
                                    "inset 0 0 4px rgba(0,0,0,0.4), 0 0 8px rgba(255,220,150,0.08)",
                            }}
                        />

                        {/* Right page */}
                        <div
                            className="relative"
                            style={{
                                width: "min(480px, 45vw)",
                                height: "min(680px, 82vh)",
                            }}
                        >
                            {rightPage ? (
                                <Page
                                    page={rightPage}
                                    totalPages={pages.length}
                                    side="right"
                                    fontSize={fontSize}
                                    fontFamily={fontFamily}
                                    lineSpacing={lineSpacing}
                                />
                            ) : (
                                <EmptyPage side="right" />
                            )}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Nav arrows */}
            <button
                onClick={goPrev}
                disabled={spreadIndex === 0}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white disabled:opacity-0 transition-all z-20"
                aria-label="Previous page"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>
            <button
                onClick={goNext}
                disabled={spreadIndex >= totalSpreads - 1}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white disabled:opacity-0 transition-all z-20"
                aria-label="Next page"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </button>

            {/* Hint */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/20 z-20">
                ← → to navigate · Space for next
            </div>
        </div>
    );
}

// ─── Page Component ───

function Page({
    page,
    totalPages,
    side,
    fontSize,
    fontFamily,
    lineSpacing,
}: {
    page: BookPage;
    totalPages: number;
    side: "left" | "right";
    fontSize: number;
    fontFamily: string;
    lineSpacing: number;
}) {
    return (
        <div
            className="w-full h-full flex flex-col relative overflow-hidden"
            style={{
                background: "#faf8f5",
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d4c9b0' fill-opacity='0.06'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
                boxShadow:
                    side === "left"
                        ? "inset -4px 0 12px rgba(0,0,0,0.08)"
                        : "inset 4px 0 12px rgba(0,0,0,0.08)",
            }}
        >
            <div
                className="absolute top-0 bottom-0 w-[20px] pointer-events-none"
                style={{
                    [side === "left" ? "right" : "left"]: 0,
                    background:
                        side === "left"
                            ? "linear-gradient(to left, rgba(0,0,0,0.1), transparent)"
                            : "linear-gradient(to right, rgba(0,0,0,0.1), transparent)",
                }}
            />
            <div
                className="flex-1 overflow-y-auto"
                style={{
                    padding: "36px 32px 16px",
                    fontSize: `${fontSize}px`,
                    fontFamily,
                    lineHeight: lineSpacing,
                    color: "#2a2420",
                    wordBreak: "break-word",
                    textAlign: "justify",
                    letterSpacing: "0.01em",
                    whiteSpace: "pre-wrap",
                }}
            >
                {page.content}
            </div>
            <div
                className="px-8 py-3 select-none"
                style={{
                    textAlign: side === "left" ? "left" : "right",
                    fontSize: "11px",
                    fontFamily: "Georgia, serif",
                    color: "#9a8e82",
                }}
            >
                {page.pageNumber} / {totalPages}
            </div>
        </div>
    );
}

function EmptyPage({ side }: { side: "left" | "right" }) {
    return (
        <div
            className="w-full h-full"
            style={{
                background: "#f5f0eb",
                boxShadow:
                    side === "left"
                        ? "inset -4px 0 12px rgba(0,0,0,0.08)"
                        : "inset 4px 0 12px rgba(0,0,0,0.08)",
            }}
        />
    );
}
