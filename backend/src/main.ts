/**
 * ZenAI Backend — Entry Point
 *
 * This file is a thin entry point that delegates to core/server.ts.
 * All startup logic, route registration, middleware, and graceful shutdown
 * are handled by the module system (see modules/ and core/).
 *
 * Architecture:
 *   main.ts → core/server.ts → modules/index.ts → 25 feature modules
 *   core/server.ts handles: Express app, route registration, startup, shutdown
 *   modules/middleware/index.ts handles: CORS, auth, rate limiting, etc.
 */

// Re-export everything from server for backward compatibility
export { app, createServer } from './core/server';
export type { ServerConfig } from './core/server';

// Start server when run directly (node main.js)
import { startIfMain } from './core/server';
startIfMain(require.main, module);
