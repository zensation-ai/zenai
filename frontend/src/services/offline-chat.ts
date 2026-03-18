/**
 * Offline Chat Service - Phase 74
 *
 * Provides offline chat capability:
 * - Detects network status
 * - Queues messages in IndexedDB (via localStorage fallback) for later sync
 * - Generates simple local responses using the heuristic provider
 * - Syncs pending messages when connectivity returns
 */

import axios from 'axios';
import { safeLocalStorage } from '../utils/storage';
import { localInference } from './local-inference';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingMessage {
  id: string;
  sessionId: string | null;
  context: string;
  content: string;
  createdAt: string;
  synced: boolean;
}

export interface OfflineResponse {
  content: string;
  isOffline: true;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'zenai_offline_pending_messages';

// ---------------------------------------------------------------------------
// Network detection
// ---------------------------------------------------------------------------

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers (with localStorage fallback)
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open('zenai_offline', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('pending_messages')) {
          db.createObjectStore('pending_messages', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGetAll(): Promise<PendingMessage[]> {
  const db = await openDB();
  if (!db) return localStorageFallbackGet();

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pending_messages', 'readonly');
      const store = tx.objectStore('pending_messages');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as PendingMessage[]);
      request.onerror = () => resolve(localStorageFallbackGet());
    } catch {
      resolve(localStorageFallbackGet());
    }
  });
}

async function idbPut(message: PendingMessage): Promise<void> {
  const db = await openDB();
  if (!db) {
    localStorageFallbackPut(message);
    return;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pending_messages', 'readwrite');
      const store = tx.objectStore('pending_messages');
      store.put(message);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        localStorageFallbackPut(message);
        resolve();
      };
    } catch {
      localStorageFallbackPut(message);
      resolve();
    }
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDB();
  if (!db) {
    localStorageFallbackDelete(id);
    return;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pending_messages', 'readwrite');
      const store = tx.objectStore('pending_messages');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// localStorage fallback
// ---------------------------------------------------------------------------

function localStorageFallbackGet(): PendingMessage[] {
  const raw = safeLocalStorage('get', STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingMessage[];
  } catch {
    return [];
  }
}

function localStorageFallbackPut(message: PendingMessage): void {
  const existing = localStorageFallbackGet();
  const idx = existing.findIndex(m => m.id === message.id);
  if (idx >= 0) {
    existing[idx] = message;
  } else {
    existing.push(message);
  }
  safeLocalStorage('set', STORAGE_KEY, JSON.stringify(existing));
}

function localStorageFallbackDelete(id: string): void {
  const existing = localStorageFallbackGet().filter(m => m.id !== id);
  safeLocalStorage('set', STORAGE_KEY, JSON.stringify(existing));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Queue a message for later sync when back online.
 */
export async function queueMessage(
  content: string,
  context: string,
  sessionId: string | null,
): Promise<PendingMessage> {
  const message: PendingMessage = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    context,
    content,
    createdAt: new Date().toISOString(),
    synced: false,
  };
  await idbPut(message);
  return message;
}

/**
 * Get all pending (unsynced) messages.
 */
export async function getPendingMessages(): Promise<PendingMessage[]> {
  const all = await idbGetAll();
  return all.filter(m => !m.synced);
}

/**
 * Sync all pending messages to the server.
 * Returns the number of successfully synced messages.
 */
export async function syncPendingMessages(): Promise<number> {
  if (isOffline()) return 0;

  const pending = await getPendingMessages();
  let synced = 0;

  for (const msg of pending) {
    try {
      // Attempt to send via the regular chat API
      const baseUrl = import.meta.env.VITE_API_URL ?? '';
      const apiKey = safeLocalStorage('get', 'apiKey') ?? import.meta.env.VITE_API_KEY;

      if (msg.sessionId) {
        await axios.post(
          `${baseUrl}/api/chat/sessions/${msg.sessionId}/messages`,
          { message: msg.content },
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined },
        );
      }
      // Mark as synced & remove
      await idbDelete(msg.id);
      synced++;
    } catch {
      // Leave in queue for next attempt
    }
  }

  return synced;
}

/**
 * Generate a simple offline response using the local heuristic provider.
 */
export async function generateOfflineResponse(query: string): Promise<OfflineResponse> {
  const intent = await localInference.classifyIntent(query);
  const sentiment = await localInference.analyzeSentiment(query);

  let content: string;

  switch (intent) {
    case 'search':
      content = 'Du bist gerade offline. Deine Suchanfrage wird gespeichert und ausgefuehrt, sobald du wieder online bist.';
      break;
    case 'action':
      content = 'Du bist gerade offline. Die Aktion wurde vorgemerkt und wird ausgefuehrt, sobald die Verbindung wiederhergestellt ist.';
      break;
    case 'code':
      content = 'Du bist gerade offline. Code-Analyse und -Generierung benoetigt eine Server-Verbindung. Deine Anfrage wird gespeichert.';
      break;
    default: {
      // Chat - provide a minimal acknowledgement
      const tone = sentiment.label === 'negative'
        ? 'Ich verstehe, dass das frustrierend sein kann. '
        : sentiment.label === 'positive'
          ? 'Das klingt gut! '
          : '';
      content = `${tone}Du bist gerade offline. Ich kann im Offline-Modus nur eingeschraenkt antworten. Deine Nachricht wird gespeichert und vollstaendig beantwortet, sobald du wieder online bist.`;
      break;
    }
  }

  return { content, isOffline: true };
}

// ---------------------------------------------------------------------------
// Auto-sync on reconnect
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPendingMessages().then(count => {
      if (count > 0) {
        logger.info(`[OfflineChat] Synced ${count} pending message(s)`);
      }
    });
  });
}
