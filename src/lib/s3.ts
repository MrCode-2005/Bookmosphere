import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import path from "path";

const isLocal = !process.env.AWS_ACCESS_KEY_ID || process.env.NODE_ENV === "development";
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "uploads");

// ─── S3 Client (production) ───

const s3 = !isLocal
    ? new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    })
    : null;

const BUCKET = process.env.AWS_S3_BUCKET || "bookflow-uploads";

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

    await s3!.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType,
        })
    );

    return `https://${BUCKET}.s3.amazonaws.com/${key}`;
}

// ─── Get Signed URL ───

export async function getSignedDownloadUrl(
    key: string,
    expiresIn = 3600
): Promise<string> {
    if (isLocal) {
        return `/api/files/${key}`;
    }

    return getSignedUrl(
        s3!,
        new GetObjectCommand({ Bucket: BUCKET, Key: key }),
        { expiresIn }
    );
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

    await s3!.send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
    );
}

// ─── Read File (for processing) ───

export async function readFile(key: string): Promise<Buffer> {
    if (isLocal) {
        const filePath = path.join(LOCAL_UPLOAD_DIR, key);
        return fs.readFile(filePath);
    }

    const res = await s3!.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: key })
    );

    const stream = res.Body;
    if (!stream) throw new Error("Empty response from S3");

    const chunks: Uint8Array[] = [];
    // @ts-expect-error — S3 stream is async iterable
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
