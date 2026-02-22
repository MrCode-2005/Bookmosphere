"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";
import { useEffect } from "react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Enable dark mode for dashboard by toggling the `dark` class
    useEffect(() => {
        document.documentElement.classList.add("dark");
        return () => {
            document.documentElement.classList.remove("dark");
        };
    }, []);

    return <AuthGuard>{children}</AuthGuard>;
}
