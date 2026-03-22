/**
 * Agent Loop Tests (Phase 132)
 *
 * TDD tests for the core agent loop: prompt building, tool extraction,
 * iteration control, and error handling.
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

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import type {
  AgentConfig,
  ToolDefinition,
  ToolUse,
  ContentBlock,
  ToolResult,
  AgentResponse,
  ToolCallRecord,
} from '../types';

import {
  buildSystemPrompt,
  extractToolUses,
  hasToolUse,
  agentLoop,
  formatToolResult,
} from '../agent-loop';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    maxIterations: 10,
    apiKey: 'sk-ant-test-key',
    ...overrides,
  };
}

function makeTextBlock(text: string): ContentBlock {
  return { type: 'text', text };
}

function makeToolUseBlock(
  name: string,
  input: Record<string, unknown>,
  id = 'toolu_test_123',
): ToolUse {
  return { type: 'tool_use', id, name, input };
}

function makeToolResultBlock(
  toolUseId: string,
  content: string,
  isError = false,
): ToolResult {
  return { type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError };
}

const sampleTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write a file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
];

const noopExecutor = jest.fn().mockResolvedValue('tool result');

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  it('should include the current working directory', () => {
    const prompt = buildSystemPrompt('/home/user/project', [], 3);
    expect(prompt).toContain('/home/user/project');
  });

  it('should mention core memory when blocks are provided', () => {
    const blocks = ['User prefers TypeScript', 'Project uses React'];
    const prompt = buildSystemPrompt('/tmp', blocks, 5);
    expect(prompt).toContain('User prefers TypeScript');
    expect(prompt).toContain('Project uses React');
  });

  it('should include the tool count', () => {
    const prompt = buildSystemPrompt('/tmp', [], 12);
    expect(prompt).toContain('12');
  });

  it('should handle zero tools', () => {
    const prompt = buildSystemPrompt('/tmp', [], 0);
    expect(prompt).toContain('0');
  });

  it('should handle empty core memory gracefully', () => {
    const prompt = buildSystemPrompt('/tmp', [], 5);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should include ZenAI identity', () => {
    const prompt = buildSystemPrompt('/tmp', [], 1);
    expect(prompt.toLowerCase()).toMatch(/zenai|zen ai|cli agent/i);
  });
});

describe('extractToolUses', () => {
  it('should extract a single tool_use block', () => {
    const blocks: ContentBlock[] = [
      makeTextBlock('Let me read that file.'),
      makeToolUseBlock('read_file', { path: '/tmp/test.ts' }),
    ];
    const result = extractToolUses(blocks);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('read_file');
    expect(result[0].input).toEqual({ path: '/tmp/test.ts' });
  });

  it('should extract multiple tool_use blocks', () => {
    const blocks: ContentBlock[] = [
      makeToolUseBlock('read_file', { path: 'a.ts' }, 'id1'),
      makeTextBlock('Reading files...'),
      makeToolUseBlock('read_file', { path: 'b.ts' }, 'id2'),
    ];
    const result = extractToolUses(blocks);
    expect(result).toHaveLength(2);
  });

  it('should return empty array when no tool_use blocks exist', () => {
    const blocks: ContentBlock[] = [makeTextBlock('Hello world')];
    const result = extractToolUses(blocks);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty content', () => {
    const result = extractToolUses([]);
    expect(result).toEqual([]);
  });

  it('should preserve tool_use id', () => {
    const blocks: ContentBlock[] = [
      makeToolUseBlock('write_file', { path: 'x', content: 'y' }, 'toolu_abc'),
    ];
    const result = extractToolUses(blocks);
    expect(result[0].id).toBe('toolu_abc');
  });
});

describe('hasToolUse', () => {
  it('should return true when tool_use is present', () => {
    const blocks: ContentBlock[] = [
      makeTextBlock('text'),
      makeToolUseBlock('read_file', {}),
    ];
    expect(hasToolUse(blocks)).toBe(true);
  });

  it('should return false when no tool_use is present', () => {
    const blocks: ContentBlock[] = [makeTextBlock('Just text')];
    expect(hasToolUse(blocks)).toBe(false);
  });

  it('should return false for empty array', () => {
    expect(hasToolUse([])).toBe(false);
  });

  it('should handle tool_result blocks without false positive', () => {
    const blocks: ContentBlock[] = [
      makeToolResultBlock('id1', 'result content'),
    ];
    expect(hasToolUse(blocks)).toBe(false);
  });
});

describe('formatToolResult', () => {
  it('should format a successful tool result', () => {
    const result = formatToolResult('read_file', 'file contents here', false);
    expect(result).toContain('read_file');
    expect(result).toContain('file contents here');
  });

  it('should format an error tool result', () => {
    const result = formatToolResult('write_file', 'Permission denied', true);
    expect(result).toContain('write_file');
    expect(result).toContain('Permission denied');
    expect(result.toLowerCase()).toContain('error');
  });

  it('should handle empty output', () => {
    const result = formatToolResult('run_command', '', false);
    expect(result).toContain('run_command');
  });

  it('should truncate very long output', () => {
    const longOutput = 'x'.repeat(50_000);
    const result = formatToolResult('read_file', longOutput, false);
    // Should be shorter than original or contain truncation indicator
    expect(result.length).toBeLessThan(longOutput.length + 500);
  });
});

describe('agentLoop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return text response when no tool calls are made', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello! How can I help?' }],
      stop_reason: 'end_turn',
    });

    const result = await agentLoop(
      'Hi there',
      makeConfig(),
      sampleTools,
      noopExecutor,
    );

    expect(result.text).toBe('Hello! How can I help?');
    expect(result.toolCalls).toHaveLength(0);
    expect(result.iterationCount).toBe(1);
  });

  it('should handle a single tool call then text response', async () => {
    // First call: assistant wants to use a tool
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Let me read the file.' },
        { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'test.ts' } },
      ],
      stop_reason: 'tool_use',
    });
    // Second call: assistant responds with text after tool result
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'The file contains TypeScript code.' }],
      stop_reason: 'end_turn',
    });

    const executor = jest.fn().mockResolvedValue('export const x = 1;');

    const result = await agentLoop(
      'Read test.ts',
      makeConfig(),
      sampleTools,
      executor,
    );

    expect(result.text).toBe('The file contains TypeScript code.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('read_file');
    expect(result.toolCalls[0].output).toBe('export const x = 1;');
    expect(result.toolCalls[0].isError).toBe(false);
    expect(result.iterationCount).toBe(2);
    expect(executor).toHaveBeenCalledWith('read_file', { path: 'test.ts' });
  });

  it('should handle multiple tool calls in one response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', id: 'toolu_a', name: 'read_file', input: { path: 'a.ts' } },
        { type: 'tool_use', id: 'toolu_b', name: 'read_file', input: { path: 'b.ts' } },
      ],
      stop_reason: 'tool_use',
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Both files read.' }],
      stop_reason: 'end_turn',
    });

    const executor = jest.fn()
      .mockResolvedValueOnce('content A')
      .mockResolvedValueOnce('content B');

    const result = await agentLoop(
      'Read both files',
      makeConfig(),
      sampleTools,
      executor,
    );

    expect(result.toolCalls).toHaveLength(2);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(result.iterationCount).toBe(2);
  });

  it('should stop at maxIterations', async () => {
    // Every response requests another tool call
    const toolResponse = {
      content: [
        { type: 'tool_use', id: 'toolu_loop', name: 'read_file', input: { path: 'x' } },
      ],
      stop_reason: 'tool_use',
    };
    mockCreate.mockResolvedValue(toolResponse);

    const result = await agentLoop(
      'Loop forever',
      makeConfig({ maxIterations: 3 }),
      sampleTools,
      noopExecutor,
    );

    expect(result.iterationCount).toBeLessThanOrEqual(3);
    // Should include a warning about max iterations in the text
    expect(result.text.toLowerCase()).toMatch(/max|iteration|limit|stop/);
  });

  it('should handle tool execution error and continue', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', id: 'toolu_err', name: 'read_file', input: { path: '/no/such/file' } },
      ],
      stop_reason: 'tool_use',
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'The file was not found.' }],
      stop_reason: 'end_turn',
    });

    const executor = jest.fn().mockRejectedValue(new Error('ENOENT: no such file'));

    const result = await agentLoop(
      'Read missing file',
      makeConfig(),
      sampleTools,
      executor,
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].isError).toBe(true);
    expect(result.toolCalls[0].output).toContain('ENOENT');
    expect(result.text).toBe('The file was not found.');
  });

  it('should handle empty message', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Please provide a message.' }],
      stop_reason: 'end_turn',
    });

    const result = await agentLoop('', makeConfig(), sampleTools, noopExecutor);
    expect(result.text).toBeTruthy();
    expect(result.iterationCount).toBe(1);
  });

  it('should pass tools to the API in correct format', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done.' }],
      stop_reason: 'end_turn',
    });

    await agentLoop('Hello', makeConfig(), sampleTools, noopExecutor);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(2);
    expect(callArgs.tools[0].name).toBe('read_file');
    expect(callArgs.tools[1].name).toBe('write_file');
  });

  it('should pass model and maxTokens from config', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
    });

    await agentLoop('Hi', makeConfig({ model: 'claude-opus-4-20250514', maxTokens: 8192 }), sampleTools, noopExecutor);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-opus-4-20250514');
    expect(callArgs.max_tokens).toBe(8192);
  });

  it('should include system prompt in API call', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
    });

    await agentLoop('Hi', makeConfig(), sampleTools, noopExecutor);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toBeTruthy();
    expect(typeof callArgs.system).toBe('string');
  });

  it('should send tool results back to the API correctly', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', id: 'toolu_verify', name: 'read_file', input: { path: 'f.ts' } },
      ],
      stop_reason: 'tool_use',
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Got it.' }],
      stop_reason: 'end_turn',
    });

    const executor = jest.fn().mockResolvedValue('file data');

    await agentLoop('Read f.ts', makeConfig(), sampleTools, executor);

    // Second API call should include tool result in messages
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMsg = secondCallMessages.find(
      (m: { role: string }) => m.role === 'user',
    );
    expect(toolResultMsg).toBeTruthy();
  });

  it('should track duration for tool calls', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', id: 'toolu_dur', name: 'read_file', input: { path: 'x' } },
      ],
      stop_reason: 'tool_use',
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done.' }],
      stop_reason: 'end_turn',
    });

    const executor = jest.fn().mockImplementation(
      () => new Promise((r) => setTimeout(() => r('ok'), 10)),
    );

    const result = await agentLoop('Test', makeConfig(), sampleTools, executor);
    expect(result.toolCalls[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.toolCalls[0].durationMs).toBe('number');
  });

  it('should handle API error gracefully', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limited'));

    await expect(
      agentLoop('Hi', makeConfig(), sampleTools, noopExecutor),
    ).rejects.toThrow('API rate limited');
  });

  it('should concatenate text blocks in final response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Part one. ' },
        { type: 'text', text: 'Part two.' },
      ],
      stop_reason: 'end_turn',
    });

    const result = await agentLoop('Hi', makeConfig(), sampleTools, noopExecutor);
    expect(result.text).toContain('Part one.');
    expect(result.text).toContain('Part two.');
  });

  it('should work with empty tools array', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'No tools available.' }],
      stop_reason: 'end_turn',
    });

    const result = await agentLoop('Hi', makeConfig(), [], noopExecutor);
    expect(result.text).toBe('No tools available.');
  });
});
