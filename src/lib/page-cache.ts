"use client";

/**
 * IndexedDB-based page cache for rendered PDF pages.
 * Stores page images as Blobs so subsequent opens are instant.
 */

const DB_NAME = "bookmosphere-page-cache";
const DB_VERSION = 1;
const PAGE_STORE = "pages";
const META_STORE = "meta";

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(PAGE_STORE)) db.createObjectStore(PAGE_STORE);
            if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Check if a fully-cached version exists for this book */
export async function getFullCache(
    bookId: string,
    expectedPages: number
): Promise<string[] | null> {
    try {
        const db = await openDB();

        // 1. Check metadata
        const meta = await new Promise<any>((res) => {
            const tx = db.transaction(META_STORE, "readonly");
            const req = tx.objectStore(META_STORE).get(bookId);
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
        });
        if (!meta || meta.pageCount !== expectedPages) return null;

        // 2. Load all page blobs in one transaction
        const tx = db.transaction(PAGE_STORE, "readonly");
        const store = tx.objectStore(PAGE_STORE);
        const promises: Promise<Blob | null>[] = [];
        for (let i = 0; i < expectedPages; i++) {
            promises.push(
                new Promise((res) => {
                    const r = store.get(`${bookId}_${i}`);
                    r.onsuccess = () => res(r.result || null);
                    r.onerror = () => res(null);
                })
            );
        }
        const blobs = await Promise.all(promises);

        // 3. Convert to object URLs
        const urls: string[] = [];
        for (const blob of blobs) {
            if (!blob) return null; // Incomplete cache
            urls.push(URL.createObjectURL(blob));
        }
        return urls;
    } catch {
        return null;
    }
}

/** Cache a single rendered page blob */
export async function cachePage(bookId: string, pageNum: number, blob: Blob): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(PAGE_STORE, "readwrite");
        tx.objectStore(PAGE_STORE).put(blob, `${bookId}_${pageNum}`);
        await new Promise<void>((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    } catch {
        // Silently fail — caching is best-effort
    }
}

/** Finalize cache metadata after all pages are rendered */
export async function finalizeCacheMeta(bookId: string, pageCount: number): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(META_STORE, "readwrite");
        tx.objectStore(META_STORE).put({ pageCount, timestamp: Date.now() }, bookId);
        await new Promise<void>((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    } catch {
        // Silently fail
    }
}
