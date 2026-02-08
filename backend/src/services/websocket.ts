/**
 * WebSocket Server Setup
 *
 * Provides WebSocket support alongside the existing Express HTTP server.
 * Uses the `ws` package with `noServer: true` pattern for clean upgrade handling.
 *
 * Phase 33 Sprint 4 - Feature 9
 */

import { Server as HTTPServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import { logger } from '../utils/logger';

// ============================================================
// Configuration
// ============================================================

const WS_PATH = '/api/voice/pipeline';
const MAX_CONNECTIONS = 50;
const HEARTBEAT_INTERVAL_MS = 30000;

// ============================================================
// Types
// ============================================================

interface AliveWebSocket extends WebSocket {
  isAlive: boolean;
}

// ============================================================
// Setup
// ============================================================

/**
 * Setup WebSocket server on an existing HTTP server.
 * Listens for upgrade requests on the voice pipeline path.
 */
export function setupWebSocket(server: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  let connectionCount = 0;

  // Handle upgrade requests - filter by path
  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = parseUrl(request.url || '').pathname;

    if (pathname !== WS_PATH) {
      // Not our path, destroy the socket
      socket.destroy();
      return;
    }

    // Check connection limit
    if (connectionCount >= MAX_CONNECTIONS) {
      logger.warn('WebSocket connection limit reached', {
        maxConnections: MAX_CONNECTIONS,
        operation: 'websocket-upgrade',
      });
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    // Authenticate via query parameter
    // Browser WebSocket API doesn't support custom headers,
    // so API key is passed as query parameter: ws://host/api/voice/pipeline?apiKey=xxx
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const apiKey = url.searchParams.get('apiKey');

    if (!apiKey) {
      logger.warn('WebSocket connection rejected: no API key', {
        operation: 'websocket-auth',
      });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Complete the WebSocket upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
      connectionCount++;
      logger.info('WebSocket connection established', {
        connectionCount,
        operation: 'websocket-connect',
      });

      ws.on('close', () => {
        connectionCount--;
        logger.info('WebSocket connection closed', {
          connectionCount,
          operation: 'websocket-disconnect',
        });
      });

      wss.emit('connection', ws, request);
    });
  });

  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const aliveWs = ws as AliveWebSocket;
      if (aliveWs.isAlive === false) {
        aliveWs.terminate();
        return;
      }
      aliveWs.isAlive = false;
      aliveWs.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  logger.info('WebSocket server initialized', {
    path: WS_PATH,
    maxConnections: MAX_CONNECTIONS,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    operation: 'websocket-setup',
  });

  return wss;
}
