#!/usr/bin/env node
/**
 * ZenAI CLI Agent — Entry Point (Phase 132)
 *
 * Terminal interface for ZenAI with persistent memory, knowledge graph,
 * and agent system. Like Claude Code, but with ZenAI's brain.
 *
 * Usage:
 *   zenai                    — Interactive REPL mode
 *   zenai "your question"    — One-shot mode
 *   zenai --help             — Show help
 *
 * @module cli/index
 */

import * as readline from 'readline';
import { agentLoop } from './agent-loop';
import { getFilesystemTools, executeFilesystemTool } from './filesystem-tools';
import { BackendBridge, getBackendTools, executeBackendTool } from './backend-bridge';
import { initContext, saveSession, clearSession } from './context';
import {
  displayWelcome,
  displayResponse,
  displayToolActivity,
  displayToolError,
  displayError,
  displayInfo,
  getPromptPrefix,
  Spinner,
} from './ui/terminal-ui';
import { logger } from './logger';
import type { AgentConfig, ToolDefinition } from './types';

// ─── Configuration ───────────────────────────────────────────────────────────

function loadConfig(): AgentConfig {
  return {
    model: process.env.ZENAI_MODEL || 'claude-sonnet-4-20250514',
    maxTokens: parseInt(process.env.ZENAI_MAX_TOKENS || '4096', 10),
    maxIterations: parseInt(process.env.ZENAI_MAX_ITERATIONS || '25', 10),
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    backendUrl: process.env.ZENAI_BACKEND_URL || process.env.API_URL,
    backendApiKey: process.env.ZENAI_BACKEND_API_KEY || process.env.VITE_API_KEY,
  };
}

// ─── Tool Executor ───────────────────────────────────────────────────────────

function createToolExecutor(config: AgentConfig, context: string) {
  const fsToolNames = new Set(getFilesystemTools().map((t) => t.name));
  const backendToolNames = new Set(getBackendTools().map((t) => t.name));

  return async (name: string, input: Record<string, unknown>): Promise<string> => {
    if (fsToolNames.has(name)) {
      return executeFilesystemTool(name, input);
    }
    if (backendToolNames.has(name)) {
      return executeBackendTool(name, input, config, context);
    }
    return `Unknown tool: ${name}`;
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Help flag
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // Version flag
  if (args.includes('--version') || args.includes('-v')) {
    console.log('zenai v0.1.0');
    return;
  }

  // Load config
  const config = loadConfig();
  if (!config.apiKey) {
    displayError('ANTHROPIC_API_KEY is not set. Please set it in your environment.');
    process.exit(1);
  }

  // Initialize context
  const cwd = process.cwd();
  const ctx = await initContext(cwd);

  // Collect all tools
  const allTools: ToolDefinition[] = [
    ...getFilesystemTools(),
    ...getBackendTools(),
  ];

  const executor = createToolExecutor(config, 'personal');

  // Check backend availability
  const bridge = new BackendBridge(config);
  const backendAvailable = await bridge.isAvailable();

  // One-shot mode: zenai "question"
  if (args.length > 0 && !args[0].startsWith('-')) {
    const message = args.join(' ');
    const spinner = new Spinner('Thinking...');
    spinner.start();

    try {
      const result = await agentLoop(message, config, allTools, executor);
      spinner.stop();
      displayResponse(result.text);
    } catch (err) {
      spinner.stop();
      displayError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  // Interactive REPL mode
  displayWelcome(ctx.projectType);

  if (backendAvailable) {
    displayInfo('Connected to ZenAI backend — memory and knowledge graph available');
  } else {
    displayInfo('Backend not available — running in local-only mode');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPromptPrefix(),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Commands
    if (input === 'exit' || input === '/exit' || input === '/quit') {
      await saveSession(ctx);
      console.log();
      displayInfo('Goodbye!');
      process.exit(0);
    }

    if (input === '/clear') {
      await clearSession(ctx);
      displayInfo('Conversation cleared.');
      rl.prompt();
      return;
    }

    if (input === '/status') {
      const backendStatus = await bridge.isAvailable();
      displayInfo(`Backend: ${backendStatus ? 'connected' : 'not available'}`);
      displayInfo(`Tools: ${allTools.length} available`);
      displayInfo(`Project: ${ctx.projectType || 'unknown'}`);
      displayInfo(`Session: ${ctx.sessionId.slice(0, 8)}...`);
      rl.prompt();
      return;
    }

    // Send to agent
    const spinner = new Spinner('Thinking...');
    spinner.start();

    try {
      const result = await agentLoop(input, config, allTools, executor);
      spinner.stop();

      // Display tool calls
      for (const tc of result.toolCalls) {
        if (tc.isError) {
          displayToolError(tc.name, tc.output.slice(0, 100));
        } else {
          displayToolActivity(tc.name, true);
          displayToolActivity(tc.name, false);
        }
      }

      displayResponse(result.text);

      // Save session periodically
      ctx.conversationHistory.push(
        { role: 'user', content: input },
        { role: 'assistant', content: result.text },
      );
      await saveSession(ctx);
    } catch (err) {
      spinner.stop();
      displayError(err instanceof Error ? err.message : String(err));
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    await saveSession(ctx);
    console.log();
    process.exit(0);
  });
}

function printHelp(): void {
  console.log(`
  ${'\x1b[1m'}ZenAI CLI Agent${'\x1b[0m'} — Your AI assistant with persistent memory

  Usage:
    zenai                     Interactive REPL mode
    zenai "your question"     One-shot mode
    zenai --help              Show this help
    zenai --version           Show version

  Commands (in REPL):
    /clear                    Clear conversation history
    /status                   Show connection status
    /exit, exit               Exit the CLI

  Environment Variables:
    ANTHROPIC_API_KEY         Required: Claude API key
    ZENAI_MODEL               Model to use (default: claude-sonnet-4-20250514)
    ZENAI_MAX_TOKENS          Max response tokens (default: 4096)
    ZENAI_MAX_ITERATIONS      Max agent loop iterations (default: 25)
    ZENAI_BACKEND_URL         ZenAI backend URL for memory/knowledge
    ZENAI_BACKEND_API_KEY     ZenAI backend API key
`);
}

// Run
main().catch((err) => {
  displayError(err.message || String(err));
  process.exit(1);
});
