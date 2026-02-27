"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useRouter } from "next/navigation";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────
interface Stats {
    totalReadingTime: number;
    pagesPerDay: number;
    wordsPerDay: number;
    booksCompleted: number;
    readingStreak: number;
    averageSessionDuration: number;
    completionPercentage: number;
}

interface DailyData {
    date: string;
    pagesRead: number;
    wordsRead: number;
    timeSpent: number;
}

interface HeatmapEntry {
    date: string;
    count: number;
}

type TimeRange = "week" | "month" | "year";

// ── Main Component ─────────────────────────────────────────────────
export default function AnalyticsPage() {
    const { accessToken } = useAuthStore();
    const router = useRouter();
    const [stats, setStats] = useState<Stats | null>(null);
    const [daily, setDaily] = useState<DailyData[]>([]);
    const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRange>("month");

    useEffect(() => {
        if (!accessToken) return;
        (async () => {
            try {
                const res = await fetch("/api/analytics", {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (res.ok) {
                    const { data } = await res.json();
                    setStats(data.stats);
                    setDaily(data.daily || []);
                    setHeatmap(data.heatmap || []);
                }
            } catch {
                // silent
            } finally {
                setLoading(false);
            }
        })();
    }, [accessToken]);

    // Compute chart data based on time range
    const chartData = useMemo(() => {
        const now = new Date();
        let days = 7;
        if (timeRange === "month") days = 30;
        if (timeRange === "year") days = 365;

        const result: { label: string; pages: number; minutes: number }[] = [];
        const dailyMap = new Map(daily.map((d) => [d.date, d]));

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            const entry = dailyMap.get(dateStr);

            let label: string;
            if (timeRange === "week") {
                label = d.toLocaleDateString("en", { weekday: "short" });
            } else if (timeRange === "month") {
                label = `${d.getMonth() + 1}/${d.getDate()}`;
            } else {
                label = d.toLocaleDateString("en", { month: "short" });
            }

            result.push({
                label,
                pages: entry?.pagesRead || 0,
                minutes: Math.round((entry?.timeSpent || 0) / 60),
            });
        }

        // For year view, aggregate by month
        if (timeRange === "year") {
            const monthMap = new Map<string, { label: string; pages: number; minutes: number }>();
            for (const item of result) {
                const existing = monthMap.get(item.label) || { label: item.label, pages: 0, minutes: 0 };
                monthMap.set(item.label, {
                    label: item.label,
                    pages: existing.pages + item.pages,
                    minutes: existing.minutes + item.minutes,
                });
            }
            return Array.from(monthMap.values());
        }

        return result;
    }, [daily, timeRange]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                    <h1 className="text-2xl font-bold text-foreground">Reading Analytics</h1>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    <StatsCard
                        label="Reading Time"
                        value={formatDuration(stats?.totalReadingTime || 0)}
                        icon="⏱️"
                        color="bg-indigo-50 border-indigo-200"
                    />
                    <StatsCard
                        label="Reading Streak"
                        value={`${stats?.readingStreak || 0} days`}
                        icon="🔥"
                        color="bg-orange-50 border-orange-200"
                    />
                    <StatsCard
                        label="Pages / Day"
                        value={stats?.pagesPerDay || 0}
                        icon="📄"
                        color="bg-emerald-50 border-emerald-200"
                    />
                    <StatsCard
                        label="Books Completed"
                        value={stats?.booksCompleted || 0}
                        icon="🏆"
                        color="bg-amber-50 border-amber-200"
                    />
                </div>

                {/* Secondary Stats */}
                <div className="grid grid-cols-3 gap-4 mb-10">
                    <MiniStat label="Avg Session" value={formatDuration(stats?.averageSessionDuration || 0)} />
                    <MiniStat label="Words / Day" value={(stats?.wordsPerDay || 0).toLocaleString()} />
                    <MiniStat label="Completion %" value={`${stats?.completionPercentage || 0}%`} />
                </div>

                {/* Reading Activity Chart */}
                <div className="bg-card border border-border rounded-2xl p-6 mb-10">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-semibold text-foreground">Reading Activity</h2>
                        <div className="flex gap-1 bg-muted rounded-lg p-1">
                            {(["week", "month", "year"] as TimeRange[]).map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeRange === range
                                        ? "bg-indigo-600 text-white shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                    {range.charAt(0).toUpperCase() + range.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {chartData.some((d) => d.pages > 0 || d.minutes > 0) ? (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                                    <defs>
                                        <linearGradient id="pagesGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                                        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="pages"
                                        stroke="#6366f1"
                                        strokeWidth={2}
                                        fill="url(#pagesGradient)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-4xl mb-3">📊</div>
                                <p className="text-muted-foreground text-sm">
                                    Start reading to see your activity chart
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Two-column: Bar Chart + Heatmap */}
                <div className="grid md:grid-cols-2 gap-6 mb-10">
                    {/* Time Spent Chart */}
                    <div className="bg-card border border-border rounded-2xl p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Time Spent</h2>
                        {chartData.some((d) => d.minutes > 0) ? (
                            <div className="h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip content={<TimeTooltip />} />
                                        <Bar dataKey="minutes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-48 flex items-center justify-center">
                                <p className="text-muted-foreground text-sm">No data yet</p>
                            </div>
                        )}
                    </div>

                    {/* Reading Heatmap */}
                    <div className="bg-card border border-border rounded-2xl p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Reading Heatmap</h2>
                        <HeatmapCalendar data={heatmap} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────

function StatsCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
    return (
        <div className={`${color} border rounded-xl p-4 hover:shadow-md transition-all`}>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{icon}</span>
                <span className="text-gray-600 text-xs uppercase tracking-wider font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-lg font-bold text-foreground">{value}</p>
            <p className="text-muted-foreground text-xs mt-1">{label}</p>
        </div>
    );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
            <p className="text-white text-xs font-medium">{label}</p>
            <p className="text-indigo-400 text-sm font-bold">{payload[0].value} pages</p>
        </div>
    );
}

function TimeTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
            <p className="text-white text-xs font-medium">{label}</p>
            <p className="text-purple-400 text-sm font-bold">{payload[0].value} min</p>
        </div>
    );
}

// ── Heatmap ────────────────────────────────────────────────────────
function HeatmapCalendar({ data }: { data: HeatmapEntry[] }) {
    const [selectedCell, setSelectedCell] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

    const { heatmapGrid, monthLabels } = useMemo(() => {
        const countMap = new Map(data.map((d) => [d.date, d.count]));
        const weeks: { date: string; count: number; dayOfWeek: number }[][] = [];
        const today = new Date();

        // Go back ~6 months (26 weeks)
        const start = new Date(today);
        start.setDate(start.getDate() - 26 * 7);
        start.setDate(start.getDate() - start.getDay()); // align to Sunday

        let currentWeek: { date: string; count: number; dayOfWeek: number }[] = [];

        const cursor = new Date(start);
        while (cursor <= today) {
            const dateStr = cursor.toISOString().split("T")[0];
            currentWeek.push({
                date: dateStr,
                count: countMap.get(dateStr) || 0,
                dayOfWeek: cursor.getDay(),
            });

            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        if (currentWeek.length > 0) weeks.push(currentWeek);

        // Calculate month labels with positions
        const months: { label: string; col: number }[] = [];
        let lastMonth = -1;
        weeks.forEach((week, wi) => {
            const firstDay = new Date(week[0].date);
            const month = firstDay.getMonth();
            if (month !== lastMonth) {
                months.push({
                    label: firstDay.toLocaleDateString("en", { month: "short" }),
                    col: wi,
                });
                lastMonth = month;
            }
        });

        return { heatmapGrid: weeks, monthLabels: months };
    }, [data]);

    const maxCount = Math.max(...data.map((d) => d.count), 1);

    const getColor = (count: number) => {
        if (count === 0) return "rgba(255,255,255,0.04)";
        const intensity = count / maxCount;
        if (intensity <= 0.25) return "rgba(99,102,241,0.3)";
        if (intensity <= 0.5) return "rgba(99,102,241,0.5)";
        if (intensity <= 0.75) return "rgba(99,102,241,0.7)";
        return "rgba(99,102,241,0.9)";
    };

    const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
    const cellSize = 14;
    const gap = 3;

    // Close tooltip on outside click
    useEffect(() => {
        if (!selectedCell) return;
        const handler = () => setSelectedCell(null);
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    }, [selectedCell]);

    return (
        <div className="relative">
            {/* Month labels */}
            <div className="flex" style={{ marginLeft: `${cellSize + gap + 4}px`, marginBottom: "4px" }}>
                {monthLabels.map((m, i) => (
                    <span
                        key={i}
                        className="text-[10px] text-muted-foreground"
                        style={{
                            position: "absolute",
                            left: `${(cellSize + gap + 4) + m.col * (cellSize + gap)}px`,
                        }}
                    >
                        {m.label}
                    </span>
                ))}
            </div>

            <div className="flex" style={{ gap: `${gap}px`, marginTop: "20px" }}>
                {/* Day labels */}
                <div className="flex flex-col" style={{ gap: `${gap}px`, marginRight: "4px" }}>
                    {dayLabels.map((label, i) => (
                        <div key={i} style={{ width: cellSize, height: cellSize }} className="flex items-center justify-end">
                            <span className="text-[9px] text-muted-foreground">{label}</span>
                        </div>
                    ))}
                </div>

                {/* Grid */}
                {heatmapGrid.map((week, wi) => (
                    <div key={wi} className="flex flex-col" style={{ gap: `${gap}px` }}>
                        {week.map((day) => (
                            <div
                                key={day.date}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                    setSelectedCell({
                                        date: day.date,
                                        count: day.count,
                                        x: rect.left + rect.width / 2,
                                        y: rect.top - 8,
                                    });
                                }}
                                style={{
                                    width: cellSize,
                                    height: cellSize,
                                    borderRadius: 3,
                                    background: getColor(day.count),
                                    cursor: "pointer",
                                    transition: "transform 0.1s, box-shadow 0.1s",
                                }}
                                className="hover:scale-125 hover:shadow-lg"
                            />
                        ))}
                    </div>
                ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 justify-end">
                <span className="text-[10px] text-muted-foreground">Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
                    <div
                        key={intensity}
                        style={{
                            width: cellSize,
                            height: cellSize,
                            borderRadius: 3,
                            background: getColor(intensity === 0 ? 0 : Math.ceil(intensity * maxCount)),
                        }}
                    />
                ))}
                <span className="text-[10px] text-muted-foreground">More</span>
            </div>

            {/* Click tooltip */}
            {selectedCell && (
                <div
                    className="fixed z-[999] px-3 py-2 rounded-lg shadow-xl text-xs pointer-events-none"
                    style={{
                        left: selectedCell.x,
                        top: selectedCell.y,
                        transform: "translate(-50%, -100%)",
                        background: "#1e1e2e",
                        border: "1px solid rgba(99,102,241,0.4)",
                        color: "#e2e8f0",
                    }}
                >
                    <p className="font-semibold">
                        {new Date(selectedCell.date + "T00:00:00").toLocaleDateString("en", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        })}
                    </p>
                    <p className="mt-0.5" style={{ color: selectedCell.count > 0 ? "#818cf8" : "#94a3b8" }}>
                        {selectedCell.count} session{selectedCell.count !== 1 ? "s" : ""}
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Helpers ────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
    if (seconds === 0) return "0m";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}
