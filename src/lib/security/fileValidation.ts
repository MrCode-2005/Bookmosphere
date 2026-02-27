/**
 * File validation utilities for book uploads.
 * Validates file type (magic bytes), size, and basic security checks.
 */

/** Allowed MIME types and their magic byte signatures */
const FILE_SIGNATURES: Record<string, number[][]> = {
    "application/pdf": [
        [0x25, 0x50, 0x44, 0x46], // %PDF
    ],
    "application/epub+zip": [
        [0x50, 0x4B, 0x03, 0x04], // PK (ZIP archive)
    ],
};

/** Maximum file sizes by type (bytes) */
const MAX_FILE_SIZES: Record<string, number> = {
    PDF: 100 * 1024 * 1024,   // 100MB
    EPUB: 50 * 1024 * 1024,   // 50MB
    DOCX: 50 * 1024 * 1024,   // 50MB
    TXT: 10 * 1024 * 1024,    // 10MB
};

/** Dangerous file extensions that should be rejected */
const BLOCKED_EXTENSIONS = new Set([
    "exe", "bat", "cmd", "sh", "ps1", "vbs", "js", "msi",
    "dll", "sys", "com", "scr", "pif", "app", "dmg",
    "jar", "py", "rb", "php", "asp", "jsp",
]);

interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validate file name for security
 */
export function validateFileName(fileName: string): ValidationResult {
    // Check for path traversal
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
        return { valid: false, error: "Invalid file name: path traversal detected" };
    }

    // Check extension
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (BLOCKED_EXTENSIONS.has(ext)) {
        return { valid: false, error: `Blocked file extension: .${ext}` };
    }

    // Check name length
    if (fileName.length > 255) {
        return { valid: false, error: "File name too long (max 255 characters)" };
    }

    // Check for null bytes
    if (fileName.includes("\0")) {
        return { valid: false, error: "Invalid file name: null byte detected" };
    }

    return { valid: true };
}

/**
 * Validate file size against type-specific limits
 */
export function validateFileSize(fileSize: number, fileType: string): ValidationResult {
    const maxSize = MAX_FILE_SIZES[fileType] || 50 * 1024 * 1024;

    if (fileSize <= 0) {
        return { valid: false, error: "File is empty" };
    }

    if (fileSize > maxSize) {
        const maxMB = Math.round(maxSize / (1024 * 1024));
        return { valid: false, error: `File too large for ${fileType} (max ${maxMB}MB)` };
    }

    return { valid: true };
}

/**
 * Validate file content by checking magic bytes
 * For use server-side when the buffer is available.
 */
export function validateMagicBytes(buffer: Buffer, mimeType: string): ValidationResult {
    const signatures = FILE_SIGNATURES[mimeType];
    if (!signatures) {
        // No signature check available — allow
        return { valid: true };
    }

    const headerBytes = Array.from(buffer.subarray(0, 8));

    const matches = signatures.some((sig) =>
        sig.every((byte, i) => headerBytes[i] === byte)
    );

    if (!matches) {
        return { valid: false, error: "File content does not match declared type" };
    }

    return { valid: true };
}

/**
 * Sanitize file name for storage
 */
export function sanitizeFileName(fileName: string): string {
    return fileName
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^[._-]+/, "")
        .slice(0, 200);
}

/**
 * Rate limiting — simple in-memory counter
 * For production, use Redis-based rate limiting
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
    userId: string,
    maxRequests: number = 10,
    windowMs: number = 60000
): ValidationResult {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
        return { valid: true };
    }

    if (entry.count >= maxRequests) {
        return { valid: false, error: "Rate limit exceeded. Please try again later." };
    }

    entry.count++;
    return { valid: true };
}
