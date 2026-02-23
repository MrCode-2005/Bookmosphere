"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/authStore";
import { useBookStore } from "@/stores/bookStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCEPTED_TYPES = [
    "application/pdf",
    "application/epub+zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".epub", ".docx", ".txt"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function UploadButton() {
    const router = useRouter();
    const { accessToken } = useAuthStore();
    const { setUploadProgress } = useBookStore();
    const [open, setOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File): string | null => {
        if (file.size > MAX_FILE_SIZE) return "File too large (max 50MB)";
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        if (!ACCEPTED_EXTENSIONS.includes(ext) && !ACCEPTED_TYPES.includes(file.type)) {
            return "Unsupported format. Use PDF, EPUB, DOCX, or TXT";
        }
        return null;
    };

    const handleFileSelect = (file: File) => {
        const err = validateFile(file);
        if (err) {
            setError(err);
            return;
        }
        setError("");
        setSelectedFile(file);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    }, []);

    const handleUpload = async () => {
        if (!selectedFile || !accessToken) return;

        setUploading(true);
        setProgress(0);
        setError("");

        try {
            // Step 1: Get signed upload URL from our API
            setProgress(5);
            const initRes = await fetch("/api/books/upload", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    fileName: selectedFile.name,
                    fileSize: selectedFile.size,
                    fileType: selectedFile.type,
                    title: title || undefined,
                }),
            });

            const initData = await initRes.json();
            if (!initRes.ok || !initData.success) {
                throw new Error(initData.error || "Failed to initialize upload");
            }

            const { uploadUrl, bookId, storageKey } = initData;

            // Step 2: Upload directly to Supabase Storage
            setProgress(15);
            const uploadRes = await fetch(uploadUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": selectedFile.type || "application/octet-stream",
                },
                body: selectedFile,
            });

            if (!uploadRes.ok) {
                throw new Error("Failed to upload file to storage");
            }

            setProgress(80);

            // Step 3: Confirm upload and trigger processing
            const confirmRes = await fetch("/api/books/upload/confirm", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ bookId, storageKey }),
            });

            const confirmData = await confirmRes.json();
            if (!confirmRes.ok || !confirmData.success) {
                throw new Error(confirmData.error || "Failed to confirm upload");
            }

            setProgress(100);
            setSuccess(true);
            setUploadProgress(100);

            // Redirect to library after short delay
            setTimeout(() => {
                setOpen(false);
                resetState();
                router.refresh();
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const resetState = () => {
        setSelectedFile(null);
        setTitle("");
        setProgress(0);
        setError("");
        setSuccess(false);
        setUploadProgress(0);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
            <DialogTrigger asChild>
                <Button
                    size="lg"
                    className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload Book
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Upload a Book</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Drag and Drop Zone */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
              relative cursor-pointer rounded-xl border-2 border-dashed p-8
              text-center transition-all duration-200
              ${isDragging
                                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                                : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-accent/50"
                            }
              ${selectedFile ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}
            `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPTED_EXTENSIONS.join(",")}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileSelect(file);
                            }}
                            className="hidden"
                        />

                        <AnimatePresence mode="wait">
                            {selectedFile ? (
                                <motion.div
                                    key="selected"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="space-y-2"
                                >
                                    <div className="text-3xl">📄</div>
                                    <p className="font-medium text-sm">{selectedFile.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="empty"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="space-y-2"
                                >
                                    <div className="text-3xl">📚</div>
                                    <p className="text-sm font-medium">
                                        Drop your book here or click to browse
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        PDF, EPUB, DOCX, TXT — up to 50MB
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Title Input */}
                    {selectedFile && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-2"
                        >
                            <Label htmlFor="book-title">Book Title</Label>
                            <Input
                                id="book-title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter book title"
                            />
                        </motion.div>
                    )}

                    {/* Progress Bar */}
                    {uploading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="space-y-2"
                        >
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${uploadProgress}%` }}
                                    transition={{ duration: 0.3 }}
                                />
                            </div>
                            <p className="text-xs text-center text-muted-foreground">
                                Uploading... {uploadProgress}%
                            </p>
                        </motion.div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 text-sm text-center"
                        >
                            ✅ Book uploaded! Processing will begin shortly.
                        </motion.div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    {selectedFile && !success && (
                        <Button
                            onClick={handleUpload}
                            disabled={uploading}
                            className="w-full"
                        >
                            {uploading ? "Uploading..." : "Upload Book"}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
