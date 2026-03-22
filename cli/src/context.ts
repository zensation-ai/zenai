/**
 * Context Management (Phase 132)
 *
 * Manages the .zenai/ directory for session persistence, project detection,
 * and conversation history storage.
 *
 * @module cli/context
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import type { CLIContext, ProjectInfo, ConversationMessage } from './types';

const ZENAI_DIR = '.zenai';
const HISTORY_FILE = 'history.json';
const SESSION_FILE = 'session.json';

// ─── Context Initialization ──────────────────────────────────────────────────

export async function initContext(cwd: string): Promise<CLIContext> {
  const zenaiDir = path.join(cwd, ZENAI_DIR);

  try {
    await fs.mkdir(zenaiDir, { recursive: true });
  } catch {
    // May fail in read-only dirs — that's ok
  }

  // Try to restore session
  const existingSession = await loadSession(zenaiDir);

  return {
    workingDirectory: cwd,
    zenaiDir,
    conversationHistory: existingSession?.history ?? [],
    sessionId: existingSession?.sessionId ?? uuidv4(),
    projectType: await detectProjectType(cwd),
  };
}

// ─── Project Detection ───────────────────────────────────────────────────────

export async function detectProjectType(cwd: string): Promise<string | undefined> {
  const checks: Array<{ file: string; type: string }> = [
    { file: 'tsconfig.json', type: 'typescript' },
    { file: 'package.json', type: 'node' },
    { file: 'Cargo.toml', type: 'rust' },
    { file: 'go.mod', type: 'go' },
    { file: 'pyproject.toml', type: 'python' },
    { file: 'requirements.txt', type: 'python' },
    { file: 'pom.xml', type: 'java' },
    { file: 'build.gradle', type: 'java' },
    { file: 'Gemfile', type: 'ruby' },
    { file: 'mix.exs', type: 'elixir' },
    { file: 'Makefile', type: 'make' },
  ];

  for (const { file, type } of checks) {
    try {
      await fs.access(path.join(cwd, file));
      return type;
    } catch {
      // File not found, continue
    }
  }

  return undefined;
}

export async function getProjectInfo(cwd: string): Promise<ProjectInfo> {
  const type = await detectProjectType(cwd) ?? 'unknown';
  let name = path.basename(cwd);
  let framework: string | undefined;

  // Try to read package.json for Node projects
  if (type === 'node' || type === 'typescript') {
    try {
      const pkg = JSON.parse(
        await fs.readFile(path.join(cwd, 'package.json'), 'utf-8'),
      );
      name = pkg.name || name;

      // Detect framework
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react) framework = 'react';
      else if (deps.vue) framework = 'vue';
      else if (deps.express) framework = 'express';
      else if (deps.next) framework = 'next';
      else if (deps.svelte) framework = 'svelte';
    } catch {
      // Ignore parse errors
    }
  }

  // Check for git
  let hasGit = false;
  try {
    await fs.access(path.join(cwd, '.git'));
    hasGit = true;
  } catch {
    // No git
  }

  return { type, name, framework, hasGit, mainFiles: [] };
}

// ─── Session Persistence ─────────────────────────────────────────────────────

interface SessionData {
  sessionId: string;
  history: ConversationMessage[];
  updatedAt: string;
}

async function loadSession(zenaiDir: string): Promise<SessionData | null> {
  try {
    const data = await fs.readFile(
      path.join(zenaiDir, SESSION_FILE),
      'utf-8',
    );
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveSession(ctx: CLIContext): Promise<void> {
  const data: SessionData = {
    sessionId: ctx.sessionId,
    history: ctx.conversationHistory.slice(-50), // Keep last 50 messages
    updatedAt: new Date().toISOString(),
  };

  try {
    await fs.writeFile(
      path.join(ctx.zenaiDir, SESSION_FILE),
      JSON.stringify(data, null, 2),
      'utf-8',
    );
  } catch (err) {
    logger.debug('Failed to save session:', err);
  }
}

export async function clearSession(ctx: CLIContext): Promise<void> {
  ctx.conversationHistory = [];
  ctx.sessionId = uuidv4();

  try {
    await fs.unlink(path.join(ctx.zenaiDir, SESSION_FILE));
  } catch {
    // File may not exist
  }
}
