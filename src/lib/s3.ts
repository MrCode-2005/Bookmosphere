import fs from "fs/promises";
import path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "books";

const isLocal =
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_KEY ||
    process.env.NODE_ENV === "development";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "uploads");

// ─── Ensure local upload dir exists ───

async function ensureLocalDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
}

// ─── Upload File ───

export async function uploadFile(
    key: string,
    body: Buffer,
    contentType: string
): Promise<string> {
    if (isLocal) {
        const filePath = path.join(LOCAL_UPLOAD_DIR, key);
        await ensureLocalDir(path.dirname(filePath));
        await fs.writeFile(filePath, body);
        return `/api/files/${key}`;
    }

    // Upload to Supabase Storage
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": contentType,
            "x-upsert": "true",
        },
        body: new Uint8Array(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Supabase Storage upload failed: ${res.status} ${errText}`);
    }

    // Return public URL
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
}

// ─── Get Download URL ───

export async function getSignedDownloadUrl(
    key: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _expiresIn = 3600
): Promise<string> {
    if (isLocal) {
        return `/api/files/${key}`;
    }

    // For public buckets, just return the public URL
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
}

// ─── Delete File ───

export async function deleteFile(key: string): Promise<void> {
    if (isLocal) {
        const filePath = path.join(LOCAL_UPLOAD_DIR, key);
        try {
            await fs.unlink(filePath);
        } catch {
            // File may not exist
        }
        return;
    }

    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`;
    const res = await fetch(url, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });

    if (!res.ok) {
        console.warn(`Failed to delete ${key} from Supabase Storage: ${res.status}`);
    }
}

// ─── Read File (for processing) ───

export async function readFile(key: string): Promise<Buffer> {
    if (isLocal) {
        const filePath = path.join(LOCAL_UPLOAD_DIR, key);
        return fs.readFile(filePath);
    }

    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Failed to read file from Supabase Storage: ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
