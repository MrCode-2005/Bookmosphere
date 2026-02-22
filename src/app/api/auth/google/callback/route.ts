import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTokens } from "@/lib/auth";
import type { JWTPayload } from "@/types";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const code = searchParams.get("code");
        const error = searchParams.get("error");

        if (error || !code) {
            return NextResponse.redirect(
                new URL(`/login?error=${error || "oauth_failed"}`, req.url)
            );
        }

        // Exchange code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID || "",
                client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
                grant_type: "authorization_code",
            }),
        });

        if (!tokenRes.ok) {
            return NextResponse.redirect(new URL("/login?error=token_exchange_failed", req.url));
        }

        const tokenData = await tokenRes.json();

        // Get user info from Google
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userRes.ok) {
            return NextResponse.redirect(new URL("/login?error=user_info_failed", req.url));
        }

        const googleUser = await userRes.json();

        // Find or create user
        let user = await prisma.user.findFirst({
            where: {
                OR: [{ googleId: googleUser.id }, { email: googleUser.email }],
            },
        });

        if (!user) {
            // Create new user
            user = await prisma.user.create({
                data: {
                    email: googleUser.email,
                    name: googleUser.name,
                    googleId: googleUser.id,
                    avatarUrl: googleUser.picture,
                    preferences: { create: {} },
                },
            });
        } else if (!user.googleId) {
            // Link Google account to existing user
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    googleId: googleUser.id,
                    avatarUrl: user.avatarUrl || googleUser.picture,
                },
            });
        }

        // Generate JWT tokens
        const payload: JWTPayload = { userId: user.id, email: user.email, role: user.role };
        const tokens = generateTokens(payload);

        // Redirect to home with token in cookie
        const response = NextResponse.redirect(new URL("/", req.url));

        response.cookies.set("refreshToken", tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60,
            path: "/",
        });

        // Set a temporary cookie with access token so the client can pick it up
        response.cookies.set("accessToken", tokens.accessToken, {
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60, // Short-lived — client reads it once and stores in memory
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Google OAuth callback error:", error);
        return NextResponse.redirect(new URL("/login?error=server_error", req.url));
    }
}
