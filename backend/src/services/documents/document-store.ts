/**
 * In-memory store for generated document buffers.
 *
 * Bridges the gap between tool execution (produces Buffer) and HTTP download
 * (needs Buffer by ID). Documents expire after 1 hour. Max 50 entries
 * to bound heap usage (~100 MB worst-case).
 *
 * @module services/documents/document-store
 */

import type { DocumentResult } from './document-generator';

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 50;

interface StoredDocument {
  doc: DocumentResult;
  storedAt: number;
}

class DocumentStore {
  private store = new Map<string, StoredDocument>();

  set(id: string, doc: DocumentResult): void {
    // Evict oldest if at capacity
    if (this.store.size >= MAX_ENTRIES && !this.store.has(id)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(id, { doc, storedAt: Date.now() });
  }

  get(id: string): DocumentResult | null {
    const entry = this.store.get(id);
    if (!entry) {return null;}

    if (Date.now() - entry.storedAt > TTL_MS) {
      this.store.delete(id);
      return null;
    }

    return entry.doc;
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }
}

export const documentStore = new DocumentStore();
