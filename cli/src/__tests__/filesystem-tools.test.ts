/**
 * Filesystem Tools Tests (Phase 132)
 *
 * TDD tests for local filesystem operations: read, write, edit, list,
 * search, and shell command execution.
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockAccess = jest.fn();
const mockStat = jest.fn();

jest.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  access: mockAccess,
  stat: mockStat,
}));

const mockExecAsync = jest.fn();
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

// We mock a promisified exec — implementation will likely use util.promisify
jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn(() => mockExecAsync),
}));

const mockGlob = jest.fn();
jest.mock('glob', () => ({
  glob: mockGlob,
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import type {
  ReadFileInput,
  WriteFileInput,
  EditFileInput,
  ListFilesInput,
  SearchContentInput,
  RunCommandInput,
  ToolDefinition,
} from '../types';

import {
  readFile,
  writeFile,
  editFile,
  listFiles,
  searchContent,
  runCommand,
  getFilesystemTools,
  executeFilesystemTool,
} from '../filesystem-tools';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('readFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should read a file and return its content', async () => {
    mockReadFile.mockResolvedValue('line1\nline2\nline3\n');

    const result = await readFile({ path: '/tmp/test.ts' });
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(mockReadFile).toHaveBeenCalledWith('/tmp/test.ts', expect.anything());
  });

  it('should support offset parameter', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    mockReadFile.mockResolvedValue(lines);

    const result = await readFile({ path: '/tmp/big.ts', offset: 5 });
    // Should skip first 5 lines
    expect(result).not.toContain('line 1\n');
    expect(result).toContain('line 6');
  });

  it('should support limit parameter', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    mockReadFile.mockResolvedValue(lines);

    const result = await readFile({ path: '/tmp/big.ts', limit: 3 });
    // Should return at most 3 lines
    const lineCount = result.trim().split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(3);
  });

  it('should support offset + limit together', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    mockReadFile.mockResolvedValue(lines);

    const result = await readFile({ path: '/tmp/big.ts', offset: 10, limit: 3 });
    expect(result).toContain('line 11');
  });

  it('should return error string when file not found', async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
    );

    const result = await readFile({ path: '/tmp/missing.ts' });
    expect(result.toLowerCase()).toContain('not found');
  });

  it('should include line numbers in output', async () => {
    mockReadFile.mockResolvedValue('first\nsecond\nthird\n');

    const result = await readFile({ path: '/tmp/numbered.ts' });
    // Should contain line number indicators (e.g., "1:" or "  1\t")
    expect(result).toMatch(/\d/);
  });
});

describe('writeFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should write content to a file', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await writeFile({ path: '/tmp/out.ts', content: 'export const x = 1;' });
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/out.ts',
      'export const x = 1;',
      expect.anything(),
    );
    expect(result.toLowerCase()).toContain('written');
  });

  it('should create parent directories', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await writeFile({ path: '/tmp/deep/nested/dir/file.ts', content: 'test' });
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/deep/nested/dir'),
      expect.objectContaining({ recursive: true }),
    );
  });

  it('should return error on permission denied', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockRejectedValue(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );

    const result = await writeFile({ path: '/root/file.ts', content: 'test' });
    expect(result.toLowerCase()).toContain('permission');
  });
});

describe('editFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should replace a unique match', async () => {
    mockReadFile.mockResolvedValue('const x = 1;\nconst y = 2;\n');
    mockWriteFile.mockResolvedValue(undefined);

    const result = await editFile({
      path: '/tmp/edit.ts',
      old_string: 'const x = 1;',
      new_string: 'const x = 42;',
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/edit.ts',
      expect.stringContaining('const x = 42;'),
      expect.anything(),
    );
    expect(result.toLowerCase()).toContain('edit');
  });

  it('should fail when old_string is not found', async () => {
    mockReadFile.mockResolvedValue('const x = 1;\n');

    const result = await editFile({
      path: '/tmp/edit.ts',
      old_string: 'const z = 99;',
      new_string: 'replaced',
    });

    expect(result.toLowerCase()).toContain('not found');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('should fail when old_string has multiple matches and replace_all is false', async () => {
    mockReadFile.mockResolvedValue('foo\nbar\nfoo\n');

    const result = await editFile({
      path: '/tmp/edit.ts',
      old_string: 'foo',
      new_string: 'baz',
    });

    expect(result.toLowerCase()).toMatch(/multiple|unique|ambiguous/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('should replace all matches when replace_all is true', async () => {
    mockReadFile.mockResolvedValue('foo\nbar\nfoo\n');
    mockWriteFile.mockResolvedValue(undefined);

    const result = await editFile({
      path: '/tmp/edit.ts',
      old_string: 'foo',
      new_string: 'baz',
      replace_all: true,
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/edit.ts',
      'baz\nbar\nbaz\n',
      expect.anything(),
    );
    expect(result.toLowerCase()).toMatch(/replaced|edit/);
  });

  it('should fail when old_string equals new_string', async () => {
    mockReadFile.mockResolvedValue('const x = 1;\n');

    const result = await editFile({
      path: '/tmp/edit.ts',
      old_string: 'const x = 1;',
      new_string: 'const x = 1;',
    });

    expect(result.toLowerCase()).toMatch(/same|identical|no change/);
  });

  it('should handle file not found on edit', async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    const result = await editFile({
      path: '/tmp/missing.ts',
      old_string: 'a',
      new_string: 'b',
    });

    expect(result.toLowerCase()).toContain('not found');
  });
});

describe('listFiles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return files matching a glob pattern', async () => {
    mockGlob.mockResolvedValue(['src/a.ts', 'src/b.ts', 'src/c.ts']);

    const result = await listFiles({ pattern: 'src/**/*.ts' });
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    expect(result).toContain('c.ts');
  });

  it('should respect custom path parameter', async () => {
    mockGlob.mockResolvedValue([]);

    await listFiles({ pattern: '**/*.ts', path: '/custom/dir' });
    expect(mockGlob).toHaveBeenCalledWith(
      '**/*.ts',
      expect.objectContaining({ cwd: '/custom/dir' }),
    );
  });

  it('should respect .gitignore by default', async () => {
    mockGlob.mockResolvedValue([]);

    await listFiles({ pattern: '**/*' });
    expect(mockGlob).toHaveBeenCalledWith(
      '**/*',
      expect.objectContaining({ ignore: expect.anything() }),
    );
  });

  it('should return sorted results', async () => {
    mockGlob.mockResolvedValue(['c.ts', 'a.ts', 'b.ts']);

    const result = await listFiles({ pattern: '*.ts' });
    const lines = result.trim().split('\n').filter(Boolean);
    // Verify sorted
    const sorted = [...lines].sort();
    expect(lines).toEqual(sorted);
  });

  it('should handle no matches gracefully', async () => {
    mockGlob.mockResolvedValue([]);

    const result = await listFiles({ pattern: '**/*.xyz' });
    expect(result.toLowerCase()).toMatch(/no files|0 files|no match/);
  });
});

describe('searchContent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should find matching lines with line numbers', async () => {
    // searchContent will likely use grep or readFile+regex internally
    // Mock glob to list files, then readFile to get content
    mockGlob.mockResolvedValue(['src/index.ts']);
    mockReadFile.mockResolvedValue('line1\nerror here\nline3\n');

    const result = await searchContent({ pattern: 'error' });
    expect(result).toContain('error here');
    // Should include file reference
    expect(result).toContain('index.ts');
  });

  it('should filter files by glob parameter', async () => {
    mockGlob.mockResolvedValue(['src/a.ts']);
    mockReadFile.mockResolvedValue('match\n');

    await searchContent({ pattern: 'match', glob: '*.ts' });
    expect(mockGlob).toHaveBeenCalledWith(
      expect.stringContaining('*.ts'),
      expect.anything(),
    );
  });

  it('should handle no matches', async () => {
    mockGlob.mockResolvedValue(['src/a.ts']);
    mockReadFile.mockResolvedValue('nothing relevant\n');

    const result = await searchContent({ pattern: 'zzzzzzz' });
    expect(result.toLowerCase()).toMatch(/no match|0 match|not found/);
  });

  it('should search in custom path', async () => {
    mockGlob.mockResolvedValue([]);

    await searchContent({ pattern: 'test', path: '/custom' });
    expect(mockGlob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cwd: '/custom' }),
    );
  });

  it('should include line numbers in results', async () => {
    mockGlob.mockResolvedValue(['file.ts']);
    mockReadFile.mockResolvedValue('line1\ntarget\nline3\n');

    const result = await searchContent({ pattern: 'target' });
    // Should contain line number (2) somewhere
    expect(result).toMatch(/2/);
  });

  it('should support regex patterns', async () => {
    mockGlob.mockResolvedValue(['file.ts']);
    mockReadFile.mockResolvedValue('const foo = 123;\nconst bar = 456;\n');

    const result = await searchContent({ pattern: 'const \\w+ = \\d+' });
    expect(result).toContain('foo');
  });
});

describe('runCommand', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should execute a shell command and return stdout', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'hello world\n', stderr: '' });

    const result = await runCommand({ command: 'echo hello world' });
    expect(result).toContain('hello world');
  });

  it('should include stderr in result', async () => {
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: 'warning: something\n' });

    const result = await runCommand({ command: 'some-cmd' });
    expect(result).toContain('warning');
  });

  it('should respect timeout parameter', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'ok', stderr: '' });

    await runCommand({ command: 'slow-cmd', timeout: 5000 });
    expect(mockExecAsync).toHaveBeenCalledWith(
      'slow-cmd',
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('should handle command execution error', async () => {
    mockExecAsync.mockRejectedValue(
      Object.assign(new Error('command failed'), { stdout: '', stderr: 'not found', code: 127 }),
    );

    const result = await runCommand({ command: 'nonexistent-cmd' });
    expect(result.toLowerCase()).toMatch(/error|failed|not found/);
  });

  it('should handle timeout error', async () => {
    mockExecAsync.mockRejectedValue(
      Object.assign(new Error('Command timed out'), { killed: true }),
    );

    const result = await runCommand({ command: 'sleep 999', timeout: 100 });
    expect(result.toLowerCase()).toMatch(/timeout|timed out|killed/);
  });

  it('should include exit code in result', async () => {
    mockExecAsync.mockResolvedValue({ stdout: 'output', stderr: '' });

    const result = await runCommand({ command: 'test-cmd' });
    // Should report exit code 0 for success
    expect(result).toMatch(/0|success|exit/i);
  });
});

describe('getFilesystemTools', () => {
  it('should return an array of 6 tool definitions', () => {
    const tools = getFilesystemTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(6);
  });

  it('should include read_file tool', () => {
    const tools = getFilesystemTools();
    const readTool = tools.find((t) => t.name === 'read_file');
    expect(readTool).toBeDefined();
    expect(readTool!.input_schema.properties).toHaveProperty('path');
    expect(readTool!.input_schema.required).toContain('path');
  });

  it('should include write_file tool', () => {
    const tools = getFilesystemTools();
    const writeTool = tools.find((t) => t.name === 'write_file');
    expect(writeTool).toBeDefined();
    expect(writeTool!.input_schema.properties).toHaveProperty('path');
    expect(writeTool!.input_schema.properties).toHaveProperty('content');
  });

  it('should include edit_file tool', () => {
    const tools = getFilesystemTools();
    const editTool = tools.find((t) => t.name === 'edit_file');
    expect(editTool).toBeDefined();
    expect(editTool!.input_schema.properties).toHaveProperty('old_string');
    expect(editTool!.input_schema.properties).toHaveProperty('new_string');
  });

  it('should include list_files tool', () => {
    const tools = getFilesystemTools();
    expect(tools.find((t) => t.name === 'list_files')).toBeDefined();
  });

  it('should include search_content tool', () => {
    const tools = getFilesystemTools();
    expect(tools.find((t) => t.name === 'search_content')).toBeDefined();
  });

  it('should include run_command tool', () => {
    const tools = getFilesystemTools();
    expect(tools.find((t) => t.name === 'run_command')).toBeDefined();
  });

  it('should have valid JSON schemas for all tools', () => {
    const tools = getFilesystemTools();
    for (const tool of tools) {
      expect(tool.input_schema.type).toBe('object');
      expect(typeof tool.input_schema.properties).toBe('object');
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

describe('executeFilesystemTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should dispatch read_file correctly', async () => {
    mockReadFile.mockResolvedValue('file content');

    const result = await executeFilesystemTool('read_file', { path: '/tmp/x.ts' });
    expect(result).toContain('file content');
  });

  it('should dispatch write_file correctly', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await executeFilesystemTool('write_file', {
      path: '/tmp/y.ts',
      content: 'data',
    });
    expect(result.toLowerCase()).toContain('written');
  });

  it('should dispatch edit_file correctly', async () => {
    mockReadFile.mockResolvedValue('old value');
    mockWriteFile.mockResolvedValue(undefined);

    const result = await executeFilesystemTool('edit_file', {
      path: '/tmp/z.ts',
      old_string: 'old value',
      new_string: 'new value',
    });
    expect(result.toLowerCase()).toMatch(/edit|replaced/);
  });

  it('should return error for unknown tool name', async () => {
    const result = await executeFilesystemTool('unknown_tool', {});
    expect(result.toLowerCase()).toMatch(/unknown|not found|unsupported/);
  });
});
