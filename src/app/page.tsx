"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

export default function Home() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (accessToken) {
      router.replace("/dashboard");
    }
  }, [accessToken, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#0f0d1a] via-[#1a1528] to-[#0f0d1a]">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
          Bookmosphere
        </h1>
        <p className="text-xl text-white/50 max-w-md">
          Immersive flipbook reading platform. Upload, read, and track your reading journey.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-6 py-3 border border-white/20 text-white/70 hover:bg-white/5 rounded-lg font-medium transition-colors"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
