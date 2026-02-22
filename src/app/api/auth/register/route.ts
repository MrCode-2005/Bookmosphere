import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateTokens } from "@/lib/auth";
import type { JWTPayload } from "@/types";

export async function POST(req: NextRequest) {
    try {
        const { email, password, name } = await req.json();

        if (!email || !password || !name) {
            return NextResponse.json(
                { success: false, error: "Email, password, and name are required" },
                { status: 400 }
            );
        }

        // Check existing user
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return NextResponse.json(
                { success: false, error: "Email already registered" },
                { status: 409 }
            );
        }

        // Create user
        const passwordHash = await hashPassword(password);
        const user = await prisma.user.create({
            data: { email, name, passwordHash },
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

        // Create default preferences
        await prisma.userPreferences.create({
            data: { userId: user.id },
        });

        // Generate tokens
        const payload: JWTPayload = { userId: user.id, email: user.email, role: user.role };
        const tokens = generateTokens(payload);

        const response = NextResponse.json(
            { success: true, user, tokens },
            { status: 201 }
        );

        // Set refresh token as HTTP-only cookie
        response.cookies.set("refreshToken", tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60, // 7 days
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
