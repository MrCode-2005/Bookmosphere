"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────
interface AdminUser {
    id: string;
    email: string;
    name: string | null;
    role: string;
    avatarUrl: string | null;
    createdAt: string;
    _count: { books: number; sessions: number };
}

interface AdminUpload {
    id: string;
    title: string;
    author: string | null;
    fileType: string;
    status: string;
    totalPages: number;
    createdAt: string;
    user: { id: string; email: string; name: string | null };
}

type Tab = "overview" | "users" | "uploads";

// ── Main Component ─────────────────────────────────────────────────
export default function AdminPage() {
    const { accessToken } = useAuthStore();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [uploads, setUploads] = useState<AdminUpload[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>("overview");

    useEffect(() => {
        if (!accessToken) return;
        Promise.all([
            fetch("/api/admin/users", { headers: { Authorization: `Bearer ${accessToken}` } })
                .then((r) => r.ok ? r.json() : { data: [] }),
            fetch("/api/admin/uploads", { headers: { Authorization: `Bearer ${accessToken}` } })
                .then((r) => r.ok ? r.json() : { data: [] }),
        ]).then(([uData, bData]) => {
            setUsers(uData.data || []);
            setUploads(bData.data || []);
        }).finally(() => setLoading(false));
    }, [accessToken]);

    const handleDeleteUpload = async (id: string) => {
        if (!confirm("Permanently delete this upload?")) return;
        try {
            await fetch(`/api/admin/uploads?id=${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            setUploads((prev) => prev.filter((u) => u.id !== id));
        } catch {
            // silent
        }
    };

    // Stats
    const totalUsers = users.length;
    const totalBooks = uploads.length;
    const readyBooks = uploads.filter((b) => b.status === "READY").length;
    const failedBooks = uploads.filter((b) => b.status === "FAILED").length;
    const processingBooks = uploads.filter((b) => b.status === "PROCESSING").length;

    // Users joined this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const newUsersThisWeek = users.filter((u) => new Date(u.createdAt) >= oneWeekAgo).length;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
            </div>
        );
    }

    const tabs: { key: Tab; label: string; icon: string }[] = [
        { key: "overview", label: "Overview", icon: "📊" },
        { key: "users", label: "Users", icon: "👥" },
        { key: "uploads", label: "Uploads", icon: "📚" },
    ];

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </Link>
                        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
                        <span className="px-2 py-0.5 bg-red-500/15 text-red-400 text-xs rounded-full font-medium border border-red-500/20">
                            Admin
                        </span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === "overview" && (
                    <div className="space-y-6">
                        {/* System Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <StatBox label="Total Users" value={totalUsers} icon="👥" />
                            <StatBox label="New This Week" value={newUsersThisWeek} icon="📈" />
                            <StatBox label="Total Books" value={totalBooks} icon="📚" />
                            <StatBox label="Ready" value={readyBooks} icon="✅" />
                            <StatBox label="Failed" value={failedBooks} icon="❌" />
                        </div>

                        {/* Quick View: Recent Users */}
                        <div className="bg-card border border-border rounded-2xl p-6">
                            <h2 className="text-base font-semibold text-foreground mb-4">Recent Users</h2>
                            <div className="space-y-2">
                                {users.slice(0, 5).map((user) => (
                                    <div key={user.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                                                {(user.name || user.email).charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{user.name || "—"}</p>
                                                <p className="text-xs text-muted-foreground">{user.email}</p>
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {user._count.books} books
                                        </div>
                                    </div>
                                ))}
                                {users.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">No users yet</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "users" && (
                    <div className="bg-card border border-border rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-border">
                            <h2 className="text-base font-semibold text-foreground">{totalUsers} Users</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                                        <th className="px-4 py-3 text-left">User</th>
                                        <th className="px-4 py-3 text-left">Email</th>
                                        <th className="px-4 py-3 text-center">Role</th>
                                        <th className="px-4 py-3 text-center">Books</th>
                                        <th className="px-4 py-3 text-center">Sessions</th>
                                        <th className="px-4 py-3 text-left">Joined</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                                                        {(user.name || user.email).charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm font-medium text-foreground">{user.name || "—"}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${user.role === "ADMIN"
                                                        ? "bg-red-500/15 text-red-400 border border-red-500/20"
                                                        : "bg-gray-500/15 text-gray-400 border border-gray-500/20"
                                                    }`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm text-foreground">{user._count.books}</td>
                                            <td className="px-4 py-3 text-center text-sm text-foreground">{user._count.sessions}</td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {new Date(user.createdAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {users.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">No users found</div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "uploads" && (
                    <div className="bg-card border border-border rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <h2 className="text-base font-semibold text-foreground">{totalBooks} Uploads</h2>
                            <div className="flex gap-2 text-xs">
                                <span className="text-emerald-400">{readyBooks} ready</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-amber-400">{processingBooks} processing</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-red-400">{failedBooks} failed</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                                        <th className="px-4 py-3 text-left">Title</th>
                                        <th className="px-4 py-3 text-left">Owner</th>
                                        <th className="px-4 py-3 text-center">Type</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                        <th className="px-4 py-3 text-center">Pages</th>
                                        <th className="px-4 py-3 text-left">Uploaded</th>
                                        <th className="px-4 py-3 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {uploads.map((book) => (
                                        <tr key={book.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{book.title}</p>
                                                {book.author && <p className="text-xs text-muted-foreground">{book.author}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {book.user?.name || book.user?.email || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs px-2 py-0.5 rounded bg-gray-500/15 text-gray-400">{book.fileType}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${book.status === "READY" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" :
                                                        book.status === "FAILED" ? "bg-red-500/15 text-red-400 border border-red-500/20" :
                                                            "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                                                    }`}>
                                                    {book.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm text-foreground">{book.totalPages}</td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {new Date(book.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => handleDeleteUpload(book.id)}
                                                    className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {uploads.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">No uploads found</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatBox({ label, value, icon }: { label: string; value: number; icon: string }) {
    return (
        <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="text-lg mb-1">{icon}</div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
    );
}
