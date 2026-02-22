"use client";

import { useState, useCallback, useEffect } from "react";

interface ControlPanelProps {
    onToggleSound: () => void;
    soundEnabled: boolean;
    onToggleFullscreen: () => void;
    isFullscreen: boolean;
    onFontSizeChange: (delta: number) => void;
    fontSize: number;
}

export default function ControlPanel({
    onToggleSound,
    soundEnabled,
    onToggleFullscreen,
    isFullscreen,
    onFontSizeChange,
    fontSize,
}: ControlPanelProps) {
    const [showFontMenu, setShowFontMenu] = useState(false);

    return (
        <div className="absolute top-14 right-3 z-30 flex flex-col gap-2">
            {/* Sound toggle */}
            <ControlButton
                onClick={onToggleSound}
                label={soundEnabled ? "Mute" : "Unmute"}
                active={soundEnabled}
            >
                {soundEnabled ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                )}
            </ControlButton>

            {/* Fullscreen */}
            <ControlButton
                onClick={onToggleFullscreen}
                label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                active={isFullscreen}
            >
                {isFullscreen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="4 14 10 14 10 20" />
                        <polyline points="20 10 14 10 14 4" />
                        <line x1="14" y1="10" x2="21" y2="3" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                )}
            </ControlButton>

            {/* Font size */}
            <ControlButton
                onClick={() => setShowFontMenu(!showFontMenu)}
                label="Font size"
                active={showFontMenu}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 7 4 4 20 4 20 7" />
                    <line x1="9" y1="20" x2="15" y2="20" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
            </ControlButton>

            {/* Font size popover */}
            {showFontMenu && (
                <div className="bg-black/80 backdrop-blur-md rounded-lg p-3 space-y-2 animate-in fade-in slide-in-from-right-2">
                    <p className="text-white/50 text-[10px] uppercase tracking-wider">Font Size</p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onFontSizeChange(-1)}
                            disabled={fontSize <= 12}
                            className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-white/70 text-sm disabled:opacity-30 transition-all"
                        >
                            A<span className="text-[10px]">-</span>
                        </button>
                        <span className="text-white/60 text-xs min-w-[28px] text-center font-mono">{fontSize}</span>
                        <button
                            onClick={() => onFontSizeChange(1)}
                            disabled={fontSize >= 24}
                            className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 text-white/70 text-sm disabled:opacity-30 transition-all"
                        >
                            A<span className="text-xs">+</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ControlButton({
    onClick,
    label,
    active,
    children,
}: {
    onClick: () => void;
    label: string;
    active?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`
        w-9 h-9 rounded-lg flex items-center justify-center transition-all
        ${active
                    ? "bg-amber-500/30 text-amber-300 shadow-lg shadow-amber-500/10"
                    : "bg-black/30 text-white/50 hover:bg-black/50 hover:text-white/80"
                }
      `}
        >
            {children}
        </button>
    );
}
