/**
 * On-Device Storage Service - Phase 94
 *
 * IndexedDB storage for on-device AI:
 * - Store user's text corpus for Markov chain training
 * - Cache inference results
 * - Store model metadata and download status
 * - Vocabulary index for TF-IDF
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextCorpusEntry {
  id: string;
  text: string;
  source: 'chat' | 'idea' | 'note';
  addedAt: string;
}

export interface InferenceCacheEntry {
  id: string;
  type: 'classify' | 'sentiment' | 'summarize' | 'complete' | 'embed';
  inputHash: string;
  result: unknown;
  cachedAt: string;
  ttlMs: number;
}

export interface ModelMetadata {
  id: string;
  name: string;
  sizeBytes: number;
  downloadedAt: string | null;
  status: 'available' | 'downloading' | 'ready' | 'error';
  progress: number;
  version: string;
}

export interface VocabEntry {
  term: string;
  df: number; // document frequency
  idf: number; // inverse document frequency
}

export interface OnDeviceStats {
  corpusSize: number;
  cacheSize: number;
  vocabSize: number;
  totalStorageBytes: number;
  queriesOnDevice: number;
  queriesCloud: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'zenai_on_device_ai';
const DB_VERSION = 1;

const STORES = {
  CORPUS: 'text_corpus',
  CACHE: 'inference_cache',
  MODELS: 'model_metadata',
  VOCAB: 'vocabulary',
  STATS: 'stats',
} as const;

// ---------------------------------------------------------------------------
// Database helper
// ---------------------------------------------------------------------------

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORES.CORPUS)) {
          const corpusStore = db.createObjectStore(STORES.CORPUS, { keyPath: 'id' });
          corpusStore.createIndex('source', 'source', { unique: false });
          corpusStore.createIndex('addedAt', 'addedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.CACHE)) {
          const cacheStore = db.createObjectStore(STORES.CACHE, { keyPath: 'id' });
          cacheStore.createIndex('inputHash', 'inputHash', { unique: false });
          cacheStore.createIndex('type', 'type', { unique: false });
          cacheStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.MODELS)) {
          db.createObjectStore(STORES.MODELS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORES.VOCAB)) {
          db.createObjectStore(STORES.VOCAB, { keyPath: 'term' });
        }

        if (!db.objectStoreNames.contains(STORES.STATS)) {
          db.createObjectStore(STORES.STATS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        dbInstance.onclose = () => { dbInstance = null; };
        resolve(dbInstance);
      };

      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Generic IDB operations
// ---------------------------------------------------------------------------

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbCount(storeName: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Hashing utility
// ---------------------------------------------------------------------------

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit int
  }
  return Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Text Corpus operations
// ---------------------------------------------------------------------------

export async function addToCorpus(text: string, source: TextCorpusEntry['source']): Promise<void> {
  if (!text || text.trim().length < 10) return; // Skip very short texts

  const entry: TextCorpusEntry = {
    id: `corpus-${Date.now()}-${hashString(text)}`,
    text: text.trim(),
    source,
    addedAt: new Date().toISOString(),
  };

  try {
    await idbPut(STORES.CORPUS, entry);
  } catch {
    // Silently fail if IDB unavailable
  }
}

export async function getCorpus(limit = 500): Promise<TextCorpusEntry[]> {
  try {
    const all = await idbGetAll<TextCorpusEntry>(STORES.CORPUS);
    // Return most recent entries
    return all.sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, limit);
  } catch {
    return [];
  }
}

export async function getCorpusText(): Promise<string> {
  const entries = await getCorpus();
  return entries.map(e => e.text).join('\n');
}

export async function clearCorpus(): Promise<void> {
  try {
    await idbClear(STORES.CORPUS);
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Inference Cache operations
// ---------------------------------------------------------------------------

export async function getCachedResult<T>(type: InferenceCacheEntry['type'], input: string): Promise<T | null> {
  try {
    const inputHash = hashString(`${type}:${input}`);
    const all = await idbGetAll<InferenceCacheEntry>(STORES.CACHE);
    const entry = all.find(e => e.inputHash === inputHash && e.type === type);

    if (!entry) return null;

    // Check TTL
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    if (age > entry.ttlMs) {
      await idbDelete(STORES.CACHE, entry.id);
      return null;
    }

    return entry.result as T;
  } catch {
    return null;
  }
}

export async function cacheResult(
  type: InferenceCacheEntry['type'],
  input: string,
  result: unknown,
  ttlMs = 30 * 60 * 1000, // 30 minutes default
): Promise<void> {
  const inputHash = hashString(`${type}:${input}`);
  const entry: InferenceCacheEntry = {
    id: `cache-${inputHash}-${type}`,
    type,
    inputHash,
    result,
    cachedAt: new Date().toISOString(),
    ttlMs,
  };

  try {
    await idbPut(STORES.CACHE, entry);
  } catch {
    // Silently fail
  }
}

export async function clearCache(): Promise<void> {
  try {
    await idbClear(STORES.CACHE);
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Model Metadata operations
// ---------------------------------------------------------------------------

export async function getModelMetadata(modelId: string): Promise<ModelMetadata | undefined> {
  try {
    return await idbGet<ModelMetadata>(STORES.MODELS, modelId);
  } catch {
    return undefined;
  }
}

export async function getAllModelMetadata(): Promise<ModelMetadata[]> {
  try {
    return await idbGetAll<ModelMetadata>(STORES.MODELS);
  } catch {
    return [];
  }
}

export async function updateModelMetadata(model: ModelMetadata): Promise<void> {
  try {
    await idbPut(STORES.MODELS, model);
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Vocabulary operations
// ---------------------------------------------------------------------------

export async function updateVocabulary(vocab: VocabEntry[]): Promise<void> {
  try {
    await idbClear(STORES.VOCAB);
    for (const entry of vocab) {
      await idbPut(STORES.VOCAB, entry);
    }
  } catch {
    // Silently fail
  }
}

export async function getVocabulary(): Promise<VocabEntry[]> {
  try {
    return await idbGetAll<VocabEntry>(STORES.VOCAB);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Stats operations
// ---------------------------------------------------------------------------

const STATS_KEY = 'global_stats';

export async function getStats(): Promise<OnDeviceStats> {
  try {
    const stored = await idbGet<OnDeviceStats & { id: string }>(STORES.STATS, STATS_KEY);
    const corpusSize = await idbCount(STORES.CORPUS);
    const cacheSize = await idbCount(STORES.CACHE);
    const vocabSize = await idbCount(STORES.VOCAB);

    return {
      corpusSize,
      cacheSize,
      vocabSize,
      totalStorageBytes: stored?.totalStorageBytes ?? 0,
      queriesOnDevice: stored?.queriesOnDevice ?? 0,
      queriesCloud: stored?.queriesCloud ?? 0,
    };
  } catch {
    return {
      corpusSize: 0,
      cacheSize: 0,
      vocabSize: 0,
      totalStorageBytes: 0,
      queriesOnDevice: 0,
      queriesCloud: 0,
    };
  }
}

export async function incrementStat(key: 'queriesOnDevice' | 'queriesCloud'): Promise<void> {
  try {
    const stats = await getStats();
    await idbPut(STORES.STATS, {
      id: STATS_KEY,
      ...stats,
      [key]: stats[key] + 1,
    });
  } catch {
    // Silently fail
  }
}

export async function clearAllStorage(): Promise<void> {
  try {
    await idbClear(STORES.CORPUS);
    await idbClear(STORES.CACHE);
    await idbClear(STORES.VOCAB);
    await idbClear(STORES.STATS);
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Estimate storage usage
// ---------------------------------------------------------------------------

export async function estimateStorageUsage(): Promise<number> {
  if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      return estimate.usage ?? 0;
    } catch {
      return 0;
    }
  }
  return 0;
}
