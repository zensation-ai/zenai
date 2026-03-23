/**
 * Notification Service
 *
 * Bridges backend SSE streams (smart-suggestions + proactive-engine)
 * to native OS notifications via Electron's Notification API.
 */

import { Notification } from 'electron';

// eventsource v3 ships as an ES module.  The Jest mock replaces the entire
// module, so we only need the import for the type annotation.
// At runtime in Electron we resolve the constructor via require() to handle
// both CJS and ESM interop gracefully.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EventSourceMod = require('eventsource');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EventSourceCtor: new (url: string) => EventSourceInstance =
  EventSourceMod.default ?? EventSourceMod;

// ─── Minimal interface ────────────────────────────────────────────────────────

interface EventSourceInstance {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
  readyState: number;
}

interface SuggestionPayload {
  title?: string;
  body?: string;
  message?: string;
  page?: string;
}

// ─── NotificationService ──────────────────────────────────────────────────────

/**
 * Connects to two backend SSE endpoints and surfaces incoming events as
 * native OS notifications.  Pass a `showAndNavigate` callback that will
 * bring the main window to the foreground and route to the given page.
 */
export class NotificationService {
  private connections: EventSourceInstance[] = [];

  constructor(private readonly showAndNavigate: (page: string) => void) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  start(backendUrl: string, context: string): void {
    this.stop();

    const endpoints = [
      `${backendUrl}/api/${context}/smart-suggestions/stream`,
      `${backendUrl}/api/${context}/proactive-engine/stream`,
    ];

    for (const url of endpoints) {
      try {
        const source = new EventSourceCtor(url);

        source.onmessage = (event: { data: string }) => {
          try {
            const payload: SuggestionPayload = JSON.parse(event.data);
            const title = payload.title ?? 'ZenAI';
            const body = payload.body ?? payload.message ?? '';
            this.showNativeNotification(title, body, payload.page);
          } catch {
            // Ignore malformed payloads
          }
        };

        source.onerror = () => {
          // EventSource handles auto-reconnect internally; we just log.
          console.warn(`[NotificationService] SSE error for ${url}`);
        };

        this.connections.push(source);
      } catch (err) {
        console.warn(`[NotificationService] Failed to connect to ${url}:`, err);
      }
    }
  }

  stop(): void {
    for (const connection of this.connections) {
      connection.close();
    }
    this.connections = [];
  }

  reconnect(backendUrl: string, context?: string): void {
    this.stop();
    this.start(backendUrl, context ?? 'personal');
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private showNativeNotification(title: string, body: string, page?: string): void {
    if (!Notification.isSupported()) return;

    const notification = new Notification({ title, body });

    notification.on('click', () => {
      if (page) {
        this.showAndNavigate(page);
      }
    });

    notification.show();
  }
}
