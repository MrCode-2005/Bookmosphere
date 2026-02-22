import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRefreshToken, generateTokens } from "@/lib/auth";
import type { JWTPayload } from "@/types";

export async function POST(req: NextRequest) {
    try {
        const refreshToken = req.cookies.get("refreshToken")?.value;

        if (!refreshToken) {
            return NextResponse.json(
                { success: false, error: "No refresh token provided" },
                { status: 401 }
            );
        }

        const payload = verifyRefreshToken(refreshToken);
        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Invalid or expired refresh token" },
                { status: 401 }
            );
        }

        // Verify user still exists
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                avatarUrl: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found" },
                { status: 401 }
            );
        }

        const newPayload: JWTPayload = { userId: user.id, email: user.email, role: user.role };
        const tokens = generateTokens(newPayload);

        const response = NextResponse.json(
            { success: true, user, tokens },
            { status: 200 }
        );

        response.cookies.set("refreshToken", tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Token refresh error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
