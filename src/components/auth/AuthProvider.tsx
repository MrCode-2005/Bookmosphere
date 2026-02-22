"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import type { SafeUser, AuthTokens } from "@/types";

/**
 * AuthProvider wraps the app and handles:
 * 1. Reading access token from cookie (set by Google OAuth)
 * 2. Refreshing tokens on page load
 * 3. Setting up auth state
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setAuth, setLoading, isAuthenticated } = useAuthStore();
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        const initAuth = async () => {
            setLoading(true);

            try {
                // Check if there's a temporary access token cookie (from OAuth)
                const cookies = document.cookie.split(";").reduce(
                    (acc, cookie) => {
                        const [key, value] = cookie.trim().split("=");
                        acc[key] = value;
                        return acc;
                    },
                    {} as Record<string, string>
                );

                if (cookies.accessToken) {
                    // Clear the temp cookie
                    document.cookie = "accessToken=; max-age=0; path=/";

                    // Fetch user info with this token
                    const res = await fetch("/api/auth/me", {
                        headers: { Authorization: `Bearer ${cookies.accessToken}` },
                    });

                    if (res.ok) {
                        const { user } = await res.json();
                        setAuth(user as SafeUser, {
                            accessToken: cookies.accessToken,
                            refreshToken: "",
                        } as AuthTokens);
                        setInitialized(true);
                        setLoading(false);
                        return;
                    }
                }

                // Try refreshing from refresh token cookie
                const refreshRes = await fetch("/api/auth/refresh", {
                    method: "POST",
                    credentials: "include",
                });

                if (refreshRes.ok) {
                    const { user, tokens } = await refreshRes.json();
                    setAuth(user as SafeUser, tokens as AuthTokens);
                }
            } catch {
                // Silently fail — user is not logged in
            } finally {
                setLoading(false);
                setInitialized(true);
            }
        };

        if (!isAuthenticated && !initialized) {
            initAuth();
        } else {
            setInitialized(true);
            setLoading(false);
        }
    }, []);

    // Show nothing while initializing to prevent flash
    if (!initialized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse text-muted-foreground">Loading...</div>
            </div>
        );
    }

    return <>{children}</>;
}
