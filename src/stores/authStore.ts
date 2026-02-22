"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SafeUser, AuthTokens } from "@/types";

interface AuthState {
    user: SafeUser | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // Actions
    setAuth: (user: SafeUser, tokens: AuthTokens) => void;
    setUser: (user: SafeUser) => void;
    setAccessToken: (token: string) => void;
    logout: () => void;
    setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: true,

            setAuth: (user, tokens) =>
                set({
                    user,
                    accessToken: tokens.accessToken,
                    isAuthenticated: true,
                    isLoading: false,
                }),

            setUser: (user) => set({ user }),

            setAccessToken: (token) => set({ accessToken: token }),

            logout: () =>
                set({
                    user: null,
                    accessToken: null,
                    isAuthenticated: false,
                    isLoading: false,
                }),

            setLoading: (loading) => set({ isLoading: loading }),
        }),
        {
            name: "bookflow-auth",
            partialize: (state) => ({
                user: state.user,
                accessToken: state.accessToken,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
