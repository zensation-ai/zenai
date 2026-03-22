/**
 * Filesystem Tools (Phase 132)
 *
 * Local filesystem operations for the ZenAI CLI Agent:
 * read, write, edit, list, search, and shell command execution.
 *
 * @module cli/filesystem-tools
 */

import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir } from 'fs/promises';
import { promisify } from 'util';
import { exec } from 'child_process';
import { glob } from 'glob';
import { dirname } from 'path';
import { logger } from './logger';
import type {
  ReadFileInput,
  WriteFileInput,
  EditFileInput,
  ListFilesInput,
  SearchContentInput,
  RunCommandInput,
  ToolDefinition,
} from './types';

const execAsync = promisify(exec);

// ─── Read File ──────────────────────────────────────────────────────────────

export async function readFile(input: ReadFileInput): Promise<string> {
  try {
    const raw = await fsReadFile(input.path, { encoding: 'utf-8' });
    let lines = raw.split('\n');

    // Remove trailing empty line from final newline
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines = lines.slice(0, -1);
    }

    const offset = input.offset ?? 0;
    lines = lines.slice(offset);

    if (input.limit !== undefined) {
      lines = lines.slice(0, input.limit);
    }

    // Add line numbers (1-based, accounting for offset)
    const numbered = lines.map((line, i) => {
      const lineNum = offset + i + 1;
      return `${lineNum}\t${line}`;
    });

    return numbered.join('\n');
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      logger.warn(`File not found: ${input.path}`);
      return `Error: File not found — ${input.path}`;
    }
    logger.error(`Failed to read file: ${input.path}`, error);
    return `Error reading file: ${error.message}`;
  }
}

// ─── Write File ─────────────────────────────────────────────────────────────

export async function writeFile(input: WriteFileInput): Promise<string> {
  try {
    const dir = dirname(input.path);
    await mkdir(dir, { recursive: true });
    await fsWriteFile(input.path, input.content, { encoding: 'utf-8' });
    logger.info(`File written: ${input.path}`);
    return `File written successfully: ${input.path}`;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EACCES') {
      logger.error(`Permission denied: ${input.path}`);
      return `Error: Permission denied — ${input.path}`;
    }
    logger.error(`Failed to write file: ${input.path}`, error);
    return `Error writing file: ${error.message}`;
  }
}

// ─── Edit File ──────────────────────────────────────────────────────────────

export async function editFile(input: EditFileInput): Promise<string> {
  if (input.old_string === input.new_string) {
    return 'Error: old_string and new_string are identical — no change needed';
  }

  let content: string;
  try {
    content = await fsReadFile(input.path, { encoding: 'utf-8' });
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return `Error: File not found — ${input.path}`;
    }
    return `Error reading file: ${(err as Error).message}`;
  }

  // Count occurrences
  const occurrences = content.split(input.old_string).length - 1;

  if (occurrences === 0) {
    return `Error: old_string not found in ${input.path}`;
  }

  if (occurrences > 1 && !input.replace_all) {
    return `Error: Multiple matches found (${occurrences}) — provide a more unique string or set replace_all to true`;
  }

  let newContent: string;
  if (input.replace_all) {
    newContent = content.replaceAll(input.old_string, input.new_string);
  } else {
    newContent = content.replace(input.old_string, input.new_string);
  }

  try {
    await fsWriteFile(input.path, newContent, { encoding: 'utf-8' });
    logger.info(`File edited: ${input.path} (${occurrences} replacement(s))`);
    return `Edit applied to ${input.path} — replaced ${occurrences} occurrence(s)`;
  } catch (err: unknown) {
    return `Error writing file: ${(err as Error).message}`;
  }
}

// ─── List Files ─────────────────────────────────────────────────────────────

export async function listFiles(input: ListFilesInput): Promise<string> {
  try {
    const files = await glob(input.pattern, {
      cwd: input.path ?? process.cwd(),
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    if (files.length === 0) {
      return 'No files found matching the pattern.';
    }

    const sorted = [...files].sort();
    return sorted.join('\n');
  } catch (err: unknown) {
    logger.error('Failed to list files', err);
    return `Error listing files: ${(err as Error).message}`;
  }
}

// ─── Search Content ─────────────────────────────────────────────────────────

export async function searchContent(input: SearchContentInput): Promise<string> {
  try {
    const filePattern = input.glob ?? '**/*';
    const files = await glob(filePattern, {
      cwd: input.path ?? process.cwd(),
      ignore: ['**/node_modules/**', '**/.git/**'],
      nodir: true,
    });

    const regex = new RegExp(input.pattern);
    const matches: string[] = [];

    for (const file of files) {
      try {
        const filePath = input.path ? `${input.path}/${file}` : file;
        const content = await fsReadFile(filePath, { encoding: 'utf-8' });
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push(`${file}:${i + 1}: ${lines[i]}`);
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    if (matches.length === 0) {
      return 'No matches found.';
    }

    return matches.join('\n');
  } catch (err: unknown) {
    logger.error('Search failed', err);
    return `Error searching: ${(err as Error).message}`;
  }
}

// ─── Run Command ────────────────────────────────────────────────────────────

export async function runCommand(input: RunCommandInput): Promise<string> {
  try {
    const options: { timeout?: number } = {};
    if (input.timeout !== undefined) {
      options.timeout = input.timeout;
    }

    const { stdout, stderr } = await execAsync(input.command, options);

    let result = '';
    if (stdout) {
      result += stdout;
    }
    if (stderr) {
      result += (result ? '\n' : '') + `stderr: ${stderr}`;
    }
    result += (result ? '\n' : '') + 'Exit code: 0';

    return result;
  } catch (err: unknown) {
    const error = err as { message?: string; stdout?: string; stderr?: string; code?: number; killed?: boolean };

    if (error.killed) {
      return `Error: Command timed out — ${input.command}`;
    }

    let result = `Error: Command failed — ${error.message ?? 'unknown error'}`;
    if (error.stdout) {
      result += `\nstdout: ${error.stdout}`;
    }
    if (error.stderr) {
      result += `\nstderr: ${error.stderr}`;
    }
    if (error.code !== undefined) {
      result += `\nExit code: ${error.code}`;
    }

    return result;
  }
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

export function getFilesystemTools(): ToolDefinition[] {
  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file at the given path. Supports offset and limit for reading specific line ranges.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file to read' },
          offset: { type: 'number', description: 'Number of lines to skip from the beginning' },
          limit: { type: 'number', description: 'Maximum number of lines to return' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write content to a file at the given path. Creates parent directories if they do not exist.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file to write' },
          content: { type: 'string', description: 'Content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'edit_file',
      description: 'Edit a file by replacing occurrences of old_string with new_string. Fails if old_string is not unique unless replace_all is true.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file to edit' },
          old_string: { type: 'string', description: 'The exact text to search for' },
          new_string: { type: 'string', description: 'The replacement text' },
          replace_all: { type: 'boolean', description: 'Replace all occurrences instead of requiring uniqueness' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    {
      name: 'list_files',
      description: 'List files matching a glob pattern. Ignores node_modules and .git by default. Returns sorted results.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern to match files (e.g. "src/**/*.ts")' },
          path: { type: 'string', description: 'Working directory for the search' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'search_content',
      description: 'Search for a regex pattern across files. Returns matching lines with file paths and line numbers.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for in file contents' },
          path: { type: 'string', description: 'Working directory for the search' },
          glob: { type: 'string', description: 'Glob pattern to filter which files to search' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'run_command',
      description: 'Execute a shell command and return its stdout, stderr, and exit code.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds' },
        },
        required: ['command'],
      },
    },
  ];
}

// ─── Tool Dispatcher ────────────────────────────────────────────────────────

export async function executeFilesystemTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'read_file':
      return readFile(input as unknown as ReadFileInput);
    case 'write_file':
      return writeFile(input as unknown as WriteFileInput);
    case 'edit_file':
      return editFile(input as unknown as EditFileInput);
    case 'list_files':
      return listFiles(input as unknown as ListFilesInput);
    case 'search_content':
      return searchContent(input as unknown as SearchContentInput);
    case 'run_command':
      return runCommand(input as unknown as RunCommandInput);
    default:
      return `Error: Unknown tool "${name}" — not found`;
  }
}
