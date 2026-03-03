// lib/imageCache.ts
// Gestionnaire d'images en cache via IndexedDB natif

const DB_NAME = 'CodeBarCRM_ImageCache';
const DB_VERSION = 1;
const STORE_NAME = 'images';

interface CachedImage {
    serialNumber: string;
    base64: string;
    timestamp: number;
}

// Initialiser la base de données
const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('IndexedDB not available on server'));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('[ImageCache] IndexedDB error:', event);
            reject(request.error);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'serialNumber' });
            }
        };
    });
};

export const saveImageToCache = async (serialNumber: string, base64: string, timestamp: number): Promise<void> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const record: CachedImage = { serialNumber, base64, timestamp };
            const request = store.put(record);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error('[ImageCache] save error:', err);
    }
};

export const getImageFromCache = async (serialNumber: string): Promise<CachedImage | null> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.get(serialNumber);

            request.onsuccess = () => resolve(request.result as CachedImage || null);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('[ImageCache] get error (will fetch from server):', err);
        return null;
    }
};

export const clearImageCache = async (): Promise<void> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.error('[ImageCache] clear error:', err);
    }
};
