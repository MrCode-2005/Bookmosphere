"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useThemeStore } from "@/stores/themeStore";
import { useRouter } from "next/navigation";

// ── Constants ──────────────────────────────────────────────────────
const FONTS = [
    { value: "Inter", label: "Inter" },
    { value: "Georgia", label: "Georgia" },
    { value: "Merriweather", label: "Merriweather" },
    { value: "Lora", label: "Lora" },
    { value: "Playfair Display", label: "Playfair" },
    { value: "Roboto Mono", label: "Roboto Mono" },
    { value: "Source Serif Pro", label: "Source Serif" },
];

const COLORS = [
    "#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F59E0B",
    "#10B981", "#06B6D4", "#3B82F6", "#F97316", "#14B8A6",
];

const TEXTURES = [
    { value: "none", label: "None" },
    { value: "paper", label: "Paper" },
    { value: "parchment", label: "Parchment" },
    { value: "linen", label: "Linen" },
];

// ── Main Component ─────────────────────────────────────────────────
export default function SettingsPage() {
    const { accessToken } = useAuthStore();
    const router = useRouter();
    const theme = useThemeStore();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Load preferences from server on mount
    useEffect(() => {
        if (!accessToken) return;
        (async () => {
            try {
                const res = await fetch("/api/preferences", {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (res.ok) {
                    const { data } = await res.json();
                    theme.loadFromPreferences(data);
                }
            } catch {
                // use local defaults
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken]);

    // Save to server
    const savePreferences = useCallback(async () => {
        if (!accessToken) return;
        setSaving(true);
        try {
            await fetch("/api/preferences", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    theme: theme.theme,
                    primaryColor: theme.primaryColor,
                    fontFamily: theme.fontFamily,
                    fontSize: theme.fontSize,
                    lineSpacing: theme.lineSpacing,
                    marginSize: theme.marginSize,
                    bgTexture: theme.bgTexture,
                    animSpeed: theme.animSpeed,
                    flipSound: theme.flipSound,
                    flipVolume: theme.flipVolume,
                    shadowIntensity: theme.shadowIntensity,
                }),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch {
            // silent
        } finally {
            setSaving(false);
        }
    }, [accessToken, theme]);

    return (
        <div className="min-h-screen">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
                    </div>
                    <button
                        onClick={savePreferences}
                        disabled={saving}
                        className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all disabled:opacity-50"
                    >
                        {saved ? "✓ Saved" : saving ? "Saving..." : "Save Changes"}
                    </button>
                </div>

                {/* Sections */}
                <div className="space-y-8">
                    {/* ── Theme Mode ── */}
                    <Section title="Theme Mode" icon="🎨">
                        <div className="grid grid-cols-3 gap-3">
                            {(["dark", "light", "sepia"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => theme.setTheme(mode)}
                                    className={`p-4 rounded-xl border-2 transition-all ${theme.theme === mode
                                            ? "border-indigo-500 shadow-lg shadow-indigo-500/10"
                                            : "border-border hover:border-foreground/20"
                                        }`}
                                >
                                    <div className={`w-full h-12 rounded-lg mb-2 ${mode === "dark" ? "bg-gray-900" :
                                            mode === "light" ? "bg-white" : "bg-amber-100"
                                        }`} />
                                    <span className="text-sm font-medium text-foreground capitalize">{mode}</span>
                                </button>
                            ))}
                        </div>
                    </Section>

                    {/* ── Accent Color ── */}
                    <Section title="Accent Color" icon="🌈">
                        <div className="flex flex-wrap gap-3">
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    onClick={() => theme.setPrimaryColor(color)}
                                    className={`w-10 h-10 rounded-full transition-all ${theme.primaryColor === color
                                            ? "ring-2 ring-offset-2 ring-offset-background ring-white scale-110"
                                            : "hover:scale-105"
                                        }`}
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                            ))}
                        </div>
                    </Section>

                    {/* ── Typography ── */}
                    <Section title="Typography" icon="✏️">
                        <div className="space-y-5">
                            {/* Font Family */}
                            <div>
                                <label className="text-sm text-muted-foreground mb-2 block">Font Family</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {FONTS.map((font) => (
                                        <button
                                            key={font.value}
                                            onClick={() => theme.setFontFamily(font.value)}
                                            className={`px-3 py-2 rounded-lg text-sm transition-all ${theme.fontFamily === font.value
                                                    ? "bg-indigo-600 text-white"
                                                    : "bg-card border border-border text-foreground hover:border-indigo-500/30"
                                                }`}
                                            style={{ fontFamily: font.value }}
                                        >
                                            {font.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Font Size */}
                            <SliderControl
                                label="Font Size"
                                value={theme.fontSize}
                                min={12}
                                max={28}
                                step={1}
                                unit="px"
                                onChange={theme.setFontSize}
                            />

                            {/* Line Spacing */}
                            <SliderControl
                                label="Line Spacing"
                                value={theme.lineSpacing}
                                min={1.0}
                                max={2.5}
                                step={0.1}
                                unit="×"
                                onChange={theme.setLineSpacing}
                            />

                            {/* Margin Size */}
                            <SliderControl
                                label="Margin Size"
                                value={theme.marginSize}
                                min={10}
                                max={80}
                                step={5}
                                unit="px"
                                onChange={theme.setMarginSize}
                            />
                        </div>
                    </Section>

                    {/* ── Reader ── */}
                    <Section title="Reader" icon="📖">
                        <div className="space-y-5">
                            {/* Animation Speed */}
                            <SliderControl
                                label="Flip Animation Speed"
                                value={theme.animSpeed}
                                min={0.3}
                                max={2.0}
                                step={0.1}
                                unit="×"
                                onChange={theme.setAnimSpeed}
                            />

                            {/* Shadow Intensity */}
                            <SliderControl
                                label="Page Shadow Intensity"
                                value={theme.shadowIntensity}
                                min={0}
                                max={1}
                                step={0.1}
                                unit=""
                                onChange={theme.setShadowIntensity}
                            />

                            {/* Background Texture */}
                            <div>
                                <label className="text-sm text-muted-foreground mb-2 block">Background Texture</label>
                                <div className="flex gap-2">
                                    {TEXTURES.map((tex) => (
                                        <button
                                            key={tex.value}
                                            onClick={() => theme.setBgTexture(tex.value)}
                                            className={`px-4 py-2 rounded-lg text-sm transition-all ${theme.bgTexture === tex.value
                                                    ? "bg-indigo-600 text-white"
                                                    : "bg-card border border-border text-foreground hover:border-indigo-500/30"
                                                }`}
                                        >
                                            {tex.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* ── Sound ── */}
                    <Section title="Sound" icon="🔊">
                        <div className="space-y-5">
                            {/* Flip Sound Toggle */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-foreground">Page Flip Sound</p>
                                    <p className="text-xs text-muted-foreground">Play a sound when turning pages</p>
                                </div>
                                <button
                                    onClick={() => theme.setFlipSound(!theme.flipSound)}
                                    className={`w-12 h-7 rounded-full transition-all relative ${theme.flipSound ? "bg-indigo-600" : "bg-gray-600"
                                        }`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all ${theme.flipSound ? "left-6" : "left-1"
                                        }`} />
                                </button>
                            </div>

                            {/* Flip Volume */}
                            {theme.flipSound && (
                                <SliderControl
                                    label="Flip Volume"
                                    value={theme.flipVolume}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    unit=""
                                    onChange={theme.setFlipVolume}
                                />
                            )}
                        </div>
                    </Section>

                    {/* Preview */}
                    <Section title="Preview" icon="👁️">
                        <div
                            className="p-6 rounded-xl border border-border"
                            style={{
                                fontFamily: theme.fontFamily,
                                fontSize: `${theme.fontSize}px`,
                                lineHeight: theme.lineSpacing,
                                paddingLeft: `${theme.marginSize}px`,
                                paddingRight: `${theme.marginSize}px`,
                            }}
                        >
                            <h3 className="text-lg font-bold text-foreground mb-2" style={{ fontFamily: theme.fontFamily }}>
                                Chapter 1: The Beginning
                            </h3>
                            <p className="text-foreground/80">
                                It was a bright cold day in April, and the clocks were striking thirteen.
                                Winston Smith, his chin nuzzled into his breast in an effort to escape the
                                vile wind, slipped quickly through the glass doors of Victory Mansions.
                            </p>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
    return (
        <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <span>{icon}</span> {title}
            </h2>
            {children}
        </div>
    );
}

function SliderControl({
    label, value, min, max, step, unit, onChange,
}: {
    label: string; value: number; min: number; max: number; step: number; unit: string;
    onChange: (v: number) => void;
}) {
    const displayValue = step >= 1 ? value : value.toFixed(1);
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-muted-foreground">{label}</label>
                <span className="text-sm font-medium text-foreground">{displayValue}{unit}</span>
            </div>
            <input
                type="range"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-700 accent-indigo-500"
            />
        </div>
    );
}
