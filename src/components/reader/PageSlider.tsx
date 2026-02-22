"use client";

import { useReaderStore } from "@/stores/readerStore";

export default function PageSlider() {
    const { currentPage, totalPages } = useReaderStore();

    if (totalPages === 0) return null;

    const progress = ((currentPage + 1) / totalPages) * 100;

    return (
        <div className="px-4 py-3 bg-black/40 backdrop-blur-sm z-20">
            <div className="flex items-center gap-3 max-w-3xl mx-auto">
                <span className="text-white/40 text-xs font-mono min-w-[32px] text-right">
                    {currentPage + 1}
                </span>

                <div className="relative flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                <span className="text-white/40 text-xs font-mono min-w-[32px]">
                    {totalPages}
                </span>
            </div>

            <div className="text-center mt-1">
                <span className="text-white/30 text-[10px]">
                    {Math.round(progress)}% complete
                </span>
            </div>
        </div>
    );
}
