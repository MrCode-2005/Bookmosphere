import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import type { JWTPayload, AuthTokens } from "@/types";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
const ACCESS_EXPIRY = 15 * 60;        // 15 minutes in seconds
const REFRESH_EXPIRY = 7 * 24 * 3600; // 7 days in seconds

// ─── Password Hashing ───

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export async function verifyPassword(
    password: string,
    hash: string
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// ─── Token Generation ───

export function generateTokens(payload: JWTPayload): AuthTokens {
    const accessToken = jwt.sign(payload, ACCESS_SECRET as jwt.Secret, {
        expiresIn: ACCESS_EXPIRY,
    });
    const refreshToken = jwt.sign(payload, REFRESH_SECRET as jwt.Secret, {
        expiresIn: REFRESH_EXPIRY,
    });
    return { accessToken, refreshToken };
}

export function generateAccessToken(payload: JWTPayload): string {
    return jwt.sign(payload, ACCESS_SECRET as jwt.Secret, { expiresIn: ACCESS_EXPIRY });
}

// ─── Token Verification ───

export function verifyAccessToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, ACCESS_SECRET as jwt.Secret) as JWTPayload;
    } catch {
        return null;
    }
}

export function verifyRefreshToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, REFRESH_SECRET as jwt.Secret) as JWTPayload;
    } catch {
        return null;
    }
}

// ─── Request Authentication ───

export function getTokenFromRequest(req: NextRequest): string | null {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice(7);
    }

    // Also check cookies for refresh token
    const cookieToken = req.cookies.get("refreshToken")?.value;
    return cookieToken || null;
}

export function authenticateRequest(req: NextRequest): JWTPayload | null {
    const token = getTokenFromRequest(req);
    if (!token) return null;
    return verifyAccessToken(token);
}

// ─── Auth Guard Helper ───

export function requireAuth(req: NextRequest): JWTPayload {
    const payload = authenticateRequest(req);
    if (!payload) {
        throw new Error("Unauthorized");
    }
    return payload;
}

export function requireAdmin(req: NextRequest): JWTPayload {
    const payload = requireAuth(req);
    if (payload.role !== "ADMIN") {
        throw new Error("Forbidden");
    }
    return payload;
}
