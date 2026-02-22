import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, generateTokens } from "@/lib/auth";
import type { JWTPayload } from "@/types";

export async function POST(req: NextRequest) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { success: false, error: "Email and password are required" },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                avatarUrl: true,
                passwordHash: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user || !user.passwordHash) {
            return NextResponse.json(
                { success: false, error: "Invalid email or password" },
                { status: 401 }
            );
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return NextResponse.json(
                { success: false, error: "Invalid email or password" },
                { status: 401 }
            );
        }

        const payload: JWTPayload = { userId: user.id, email: user.email, role: user.role };
        const tokens = generateTokens(payload);

        // Remove passwordHash from response
        const { passwordHash: _, ...safeUser } = user;

        const response = NextResponse.json(
            { success: true, user: safeUser, tokens },
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
        console.error("Login error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
