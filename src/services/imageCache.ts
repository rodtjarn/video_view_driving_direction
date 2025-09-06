export interface CacheEntry {
  url: string;
  blob: Blob;
  timestamp: number;
  size: number;
}

export interface CacheProgress {
  total: number;
  cached: number;
  failed: number;
  percentage: number;
}

class ImageCacheService {
  private dbName = 'streetview-image-cache';
  private storeName = 'images';
  private version = 1;
  private db: IDBDatabase | null = null;
  private maxCacheSize = 500 * 1024 * 1024; // 500MB max cache size
  private maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve();
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'url' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async cacheImage(url: string): Promise<string | null> {
    if (!this.db) await this.initialize();

    try {
      // Check if image is already cached
      const existing = await this.getCachedImage(url);
      if (existing) {
        return existing;
      }

      // Fetch the image
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const entry: CacheEntry = {
        url,
        blob,
        timestamp: Date.now(),
        size: blob.size,
      };

      // Store in IndexedDB
      await this.storeEntry(entry);

      // Clean up old entries if needed
      await this.cleanupCache();

      // Return blob URL for immediate use
      return URL.createObjectURL(blob);
    } catch (error) {
      console.warn(`Failed to cache image ${url}:`, error);
      return null;
    }
  }

  async getCachedImage(url: string): Promise<string | null> {
    if (!this.db) await this.initialize();

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CacheEntry | undefined;
        
        if (!result) {
          resolve(null);
          return;
        }

        // Check if entry is expired
        if (Date.now() - result.timestamp > this.maxAge) {
          // Delete expired entry
          this.deleteEntry(url);
          resolve(null);
          return;
        }

        // Return blob URL
        resolve(URL.createObjectURL(result.blob));
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  }

  async cacheImages(urls: string[], onProgress?: (progress: CacheProgress) => void): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    let cached = 0;
    let failed = 0;

    const updateProgress = () => {
      if (onProgress) {
        onProgress({
          total: urls.length,
          cached,
          failed,
          percentage: ((cached + failed) / urls.length) * 100,
        });
      }
    };

    // Process images in batches to avoid overwhelming the browser
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (url) => {
        try {
          const cachedUrl = await this.cacheImage(url);
          if (cachedUrl) {
            results.set(url, cachedUrl);
            cached++;
          } else {
            failed++;
          }
        } catch (error) {
          console.warn(`Failed to cache image ${url}:`, error);
          failed++;
        }
        updateProgress();
      });

      await Promise.all(batchPromises);
      
      // Small delay between batches to prevent blocking the UI
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return results;
  }

  private async storeEntry(entry: CacheEntry): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteEntry(url: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(url);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve(); // Don't fail on delete errors
    });
  }

  private async cleanupCache(): Promise<void> {
    if (!this.db) return;

    try {
      const entries = await this.getAllEntries();
      const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

      if (totalSize > this.maxCacheSize) {
        // Sort by timestamp (oldest first) and delete until under size limit
        entries.sort((a, b) => a.timestamp - b.timestamp);
        
        let currentSize = totalSize;
        for (const entry of entries) {
          if (currentSize <= this.maxCacheSize * 0.8) break; // Keep 20% buffer
          
          await this.deleteEntry(entry.url);
          currentSize -= entry.size;
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup cache:', error);
    }
  }

  private async getAllEntries(): Promise<CacheEntry[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearCache(): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCacheStats(): Promise<{ count: number; totalSize: number }> {
    const entries = await this.getAllEntries();
    return {
      count: entries.length,
      totalSize: entries.reduce((sum, entry) => sum + entry.size, 0),
    };
  }
}

export const imageCache = new ImageCacheService();