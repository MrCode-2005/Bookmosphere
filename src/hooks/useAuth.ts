"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import type { LoginRequest, RegisterRequest, AuthTokens, SafeUser } from "@/types";

export function useAuth() {
    const router = useRouter();
    const { user, accessToken, isAuthenticated, isLoading, setAuth, logout: clearAuth, setLoading } = useAuthStore();

    const login = async (data: LoginRequest) => {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            credentials: "include",
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Login failed");
        }

        const result = await res.json();
        setAuth(result.user as SafeUser, result.tokens as AuthTokens);
        router.push("/");
    };

    const register = async (data: RegisterRequest) => {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Registration failed");
        }

        const result = await res.json();
        setAuth(result.user as SafeUser, result.tokens as AuthTokens);
        router.push("/");
    };

    const loginWithGoogle = async () => {
        window.location.href = "/api/auth/google";
    };

    const logout = async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        clearAuth();
        router.push("/login");
    };

    const refreshToken = async () => {
        try {
            const res = await fetch("/api/auth/refresh", {
                method: "POST",
                credentials: "include",
            });

            if (!res.ok) {
                clearAuth();
                return;
            }

            const result = await res.json();
            setAuth(result.user, result.tokens);
        } catch {
            clearAuth();
        }
    };

    return {
        user,
        accessToken,
        isAuthenticated,
        isLoading,
        login,
        register,
        loginWithGoogle,
        logout,
        refreshToken,
        setLoading,
    };
}
