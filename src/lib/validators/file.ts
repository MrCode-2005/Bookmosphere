const ALLOWED_TYPES: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "application/epub+zip": ["epub"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
    "text/plain": ["txt"],
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Magic bytes for file type detection
const MAGIC_BYTES: Record<string, number[]> = {
    pdf: [0x25, 0x50, 0x44, 0x46],       // %PDF
    epub: [0x50, 0x4b, 0x03, 0x04],      // PK (ZIP archive)
    docx: [0x50, 0x4b, 0x03, 0x04],      // PK (ZIP archive)
};

export interface ValidationResult {
    valid: boolean;
    error?: string;
    fileType?: "PDF" | "EPUB" | "DOCX" | "TXT";
}

/**
 * Validate an uploaded file for type and size constraints.
 */
export function validateFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    size: number
): ValidationResult {
    // Check file size
    if (size > MAX_FILE_SIZE) {
        return { valid: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` };
    }

    // Check extension
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "epub", "docx", "txt"].includes(ext)) {
        return { valid: false, error: `Unsupported file type: .${ext}. Allowed: PDF, EPUB, DOCX, TXT.` };
    }

    // Check MIME type
    const allowedMimes = Object.keys(ALLOWED_TYPES);
    if (!allowedMimes.includes(mimeType) && mimeType !== "application/octet-stream") {
        return { valid: false, error: `Invalid MIME type: ${mimeType}.` };
    }

    // Check magic bytes (skip for TXT)
    if (ext !== "txt") {
        const expected = MAGIC_BYTES[ext];
        if (expected) {
            const header = Array.from(buffer.subarray(0, expected.length));
            const matches = expected.every((byte, i) => header[i] === byte);
            if (!matches) {
                return { valid: false, error: "File content does not match its extension." };
            }
        }
    }

    // Map extension to FileType enum
    const fileTypeMap: Record<string, "PDF" | "EPUB" | "DOCX" | "TXT"> = {
        pdf: "PDF",
        epub: "EPUB",
        docx: "DOCX",
        txt: "TXT",
    };

    return { valid: true, fileType: fileTypeMap[ext] };
}

/**
 * Sanitize filename for storage.
 */
export function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_{2,}/g, "_")
        .substring(0, 255);
}
