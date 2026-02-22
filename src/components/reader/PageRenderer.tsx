"use client";

import React, { forwardRef } from "react";

interface PageRendererProps {
    pageNumber: number;
    content: string;
    totalPages: number;
    fontSize?: number;
    fontFamily?: string;
    lineSpacing?: number;
}

/**
 * Renders a single book page with realistic look.
 * Used by FlipbookReader as each page in the flipbook.
 */
const PageRenderer = forwardRef<HTMLDivElement, PageRendererProps>(
    ({ pageNumber, content, totalPages, fontSize = 16, fontFamily = "Georgia, serif", lineSpacing = 1.8 }, ref) => {
        const isLeftPage = pageNumber % 2 === 0;

        return (
            <div
                ref={ref}
                className="page-content"
                style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#faf8f5",
                    backgroundImage: `
            linear-gradient(to right, rgba(0,0,0,0.02) 0%, transparent 5%, transparent 95%, rgba(0,0,0,0.02) 100%),
            url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d4c9b0' fill-opacity='0.08'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")
          `,
                    overflow: "hidden",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: isLeftPage
                        ? "inset -3px 0 8px rgba(0,0,0,0.1)"
                        : "inset 3px 0 8px rgba(0,0,0,0.1)",
                }}
            >
                {/* Page texture overlay */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: isLeftPage
                            ? "linear-gradient(to right, rgba(0,0,0,0.03), transparent 20%)"
                            : "linear-gradient(to left, rgba(0,0,0,0.03), transparent 20%)",
                        pointerEvents: "none",
                    }}
                />

                {/* Content area */}
                <div
                    style={{
                        flex: 1,
                        padding: "40px 36px 20px",
                        fontSize: `${fontSize}px`,
                        fontFamily,
                        lineHeight: lineSpacing,
                        color: "#2a2420",
                        overflowY: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        textAlign: "justify",
                        letterSpacing: "0.01em",
                    }}
                >
                    {content}
                </div>

                {/* Page number */}
                <div
                    style={{
                        padding: "8px 36px 16px",
                        textAlign: isLeftPage ? "left" : "right",
                        fontSize: "12px",
                        fontFamily: "Georgia, serif",
                        color: "#8a7e72",
                        userSelect: "none",
                    }}
                >
                    {pageNumber} / {totalPages}
                </div>

                {/* Spine shadow for inner edge */}
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        width: "15px",
                        [isLeftPage ? "right" : "left"]: 0,
                        background: isLeftPage
                            ? "linear-gradient(to left, rgba(0,0,0,0.12), transparent)"
                            : "linear-gradient(to right, rgba(0,0,0,0.12), transparent)",
                        pointerEvents: "none",
                    }}
                />
            </div>
        );
    }
);

PageRenderer.displayName = "PageRenderer";

export default PageRenderer;
