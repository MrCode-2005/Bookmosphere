import { NextResponse } from "next/server";

export async function POST() {
    const response = NextResponse.json({ success: true, message: "Logged out" });

    // Clear cookies
    response.cookies.set("refreshToken", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
    });

    response.cookies.set("accessToken", "", {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
    });

    return response;
}
