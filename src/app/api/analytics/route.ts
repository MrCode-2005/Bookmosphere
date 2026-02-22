import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// GET /api/analytics — Get reading analytics
export async function GET(req: NextRequest) {
    try {
        const payload = requireAuth(req);

        // Get all sessions
        const sessions = await prisma.readingSession.findMany({
            where: { userId: payload.userId },
            orderBy: { startedAt: "desc" },
        });

        // Calculate stats
        const totalReadingTime = sessions.reduce((sum, s) => sum + s.duration, 0);
        const totalPagesRead = sessions.reduce((sum, s) => sum + s.pagesRead, 0);
        const totalWordsRead = sessions.reduce((sum, s) => sum + s.wordsRead, 0);

        // Books completed
        const completedBooks = await prisma.readingProgress.count({
            where: { userId: payload.userId, percentage: { gte: 95 } },
        });

        // Total books
        const totalBooks = await prisma.book.count({
            where: { userId: payload.userId, status: "READY" },
        });

        // Calculate days with reading (for streak and per-day stats)
        const uniqueDays = new Set(
            sessions.map((s) => s.startedAt.toISOString().split("T")[0])
        );
        const daysCount = Math.max(uniqueDays.size, 1);

        // Calculate reading streak
        const sortedDates = Array.from(uniqueDays).sort().reverse();
        let streak = 0;
        const today = new Date().toISOString().split("T")[0];
        for (let i = 0; i < sortedDates.length; i++) {
            const expected = new Date();
            expected.setDate(expected.getDate() - i);
            if (sortedDates[i] === expected.toISOString().split("T")[0]) {
                streak++;
            } else break;
        }

        const stats = {
            totalReadingTime,
            pagesPerDay: Math.round(totalPagesRead / daysCount),
            wordsPerDay: Math.round(totalWordsRead / daysCount),
            booksCompleted: completedBooks,
            readingStreak: streak,
            averageSessionDuration: sessions.length > 0 ? Math.round(totalReadingTime / sessions.length) : 0,
            completionPercentage: totalBooks > 0 ? Math.round((completedBooks / totalBooks) * 100) : 0,
        };

        // Daily data (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSessions = sessions.filter((s) => s.startedAt >= thirtyDaysAgo);
        const dailyMap = new Map<string, { pagesRead: number; wordsRead: number; timeSpent: number }>();

        for (const session of recentSessions) {
            const date = session.startedAt.toISOString().split("T")[0];
            const existing = dailyMap.get(date) || { pagesRead: 0, wordsRead: 0, timeSpent: 0 };
            dailyMap.set(date, {
                pagesRead: existing.pagesRead + session.pagesRead,
                wordsRead: existing.wordsRead + session.wordsRead,
                timeSpent: existing.timeSpent + session.duration,
            });
        }

        const daily = Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data }));

        // Heatmap data (last 365 days)
        const heatmap = Array.from(uniqueDays).map((date) => ({
            date,
            count: sessions.filter((s) => s.startedAt.toISOString().split("T")[0] === date).length,
        }));

        return NextResponse.json({
            success: true,
            data: { stats, daily, heatmap },
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        console.error("Analytics error:", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
