import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";

// Routes that don't require authentication
const publicPaths = new Set([
    "/",
    "/login",
    "/register",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/auth/google",
    "/api/auth/google/callback",
    "/api/auth/logout",
    "/api/auth/me",
]);

// Routes that start with these prefixes are public
const publicPrefixes = ["/_next", "/favicon", "/sounds", "/images", "/api/files"];

// Security headers applied to all responses
const SECURITY_HEADERS: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function getSecret() {
    const secret = process.env.JWT_ACCESS_SECRET || "dev-access-secret-32-characters!!";
    return new TextEncoder().encode(secret);
}

async function verifyToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, getSecret());
        return payload as unknown as { userId: string; email: string; role: string };
    } catch {
        return null;
    }
}

function addSecurityHeaders(response: NextResponse): NextResponse {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        response.headers.set(key, value);
    }
    return response;
}

function getRateLimitConfig(pathname: string) {
    if (pathname.startsWith("/api/auth/")) return RATE_LIMITS.auth;
    if (pathname.startsWith("/api/books/upload")) return RATE_LIMITS.upload;
    if (pathname.startsWith("/api/search")) return RATE_LIMITS.search;
    return RATE_LIMITS.api;
}

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Skip public paths
    if (publicPaths.has(pathname)) {
        return addSecurityHeaders(NextResponse.next());
    }

    // Skip public prefixes
    if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
        return NextResponse.next();
    }

    // For API routes: check Authorization header + rate limit
    if (pathname.startsWith("/api/")) {
        // Rate limiting (by IP)
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "anonymous";
        const rateLimitConfig = getRateLimitConfig(pathname);
        const { allowed, remaining, resetAt } = checkRateLimit(`${ip}:${pathname}`, rateLimitConfig);

        if (!allowed) {
            const res = NextResponse.json(
                { success: false, error: "Too many requests. Please try again later." },
                { status: 429 }
            );
            res.headers.set("Retry-After", String(Math.ceil((resetAt - Date.now()) / 1000)));
            res.headers.set("X-RateLimit-Remaining", "0");
            return addSecurityHeaders(res);
        }

        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "");

        if (!token) {
            return addSecurityHeaders(
                NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
            );
        }

        const payload = await verifyToken(token);
        if (!payload) {
            return addSecurityHeaders(
                NextResponse.json({ success: false, error: "Invalid or expired token" }, { status: 401 })
            );
        }

        // Pass user info in headers for downstream route handlers
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set("x-user-id", payload.userId);
        requestHeaders.set("x-user-email", payload.email);
        requestHeaders.set("x-user-role", payload.role);

        const response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set("X-RateLimit-Remaining", String(remaining));
        return addSecurityHeaders(response);
    }

    // For page routes: check for refresh token cookie
    const refreshToken = req.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
        // Redirect to login
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Allow through — the client will handle token refresh
    return addSecurityHeaders(NextResponse.next());
}

export const config = {
    matcher: [
        // Match all routes except static files
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
