"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

interface AuthGuardProps {
    children: React.ReactNode;
    requireAdmin?: boolean;
}

/**
 * AuthGuard protects client-side routes.
 * Redirects to login if unauthenticated.
 * Redirects to home if non-admin tries to access admin routes.
 */
export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
    const router = useRouter();
    const { isAuthenticated, isLoading, user } = useAuthStore();

    useEffect(() => {
        if (isLoading) return;

        if (!isAuthenticated) {
            router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            return;
        }

        if (requireAdmin && user?.role !== "ADMIN") {
            router.push("/");
        }
    }, [isAuthenticated, isLoading, user, requireAdmin, router]);

    // While loading, still render children for instant page transition
    // The redirect effect will handle unauthorized users once loading completes
    if (isLoading) {
        return <>{children}</>;
    }

    if (!isAuthenticated) return null;

    if (requireAdmin && user?.role !== "ADMIN") return null;

    return <>{children}</>;
}
