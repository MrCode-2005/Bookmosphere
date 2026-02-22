"use client";

import { useState, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import type { ReadingStats, DailyReadingData, HeatmapData } from "@/types";

export function useAnalytics() {
    const { accessToken } = useAuthStore();
    const [stats, setStats] = useState<ReadingStats | null>(null);
    const [dailyData, setDailyData] = useState<DailyReadingData[]>([]);
    const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const headers = {
        Authorization: `Bearer ${accessToken}`,
    };

    const fetchStats = useCallback(async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const res = await fetch("/api/analytics", { headers });
            if (res.ok) {
                const { data } = await res.json();
                setStats(data.stats);
                setDailyData(data.daily || []);
                setHeatmapData(data.heatmap || []);
            }
        } catch (err) {
            console.error("Failed to fetch analytics:", err);
        } finally {
            setIsLoading(false);
        }
    }, [accessToken]);

    return {
        stats,
        dailyData,
        heatmapData,
        isLoading,
        fetchStats,
    };
}
