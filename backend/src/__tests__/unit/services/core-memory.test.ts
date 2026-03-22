/**
 * Phase 126: Core Memory Service Tests
 *
 * Core Memory blocks are structured text blocks always injected
 * into Claude's system prompt. 4 block types per user per context.
 */

import { queryContext } from '../../../utils/database-context';
import {
  getCoreMemoryBlocks,
  getCoreMemoryBlock,
  updateCoreMemoryBlock,
  appendToCoreMemoryBlock,
  buildCoreMemoryPromptSection,
  initializeDefaultBlocks,
  CORE_BLOCK_TYPES,
  MAX_BLOCK_CHARS,
  CoreMemoryBlock,
} from '../../../services/memory/core-memory';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Mock Data
// ===========================================

const makeBlock = (overrides: Partial<{
  id: string;
  user_id: string;
  block_type: string;
  content: string;
  version: number;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}> = {}) => ({
  id: 'block-001',
  user_id: 'user-abc',
  block_type: 'user_profile',
  content: 'Name: Alex. Developer.',
  version: 1,
  updated_by: 'user',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  ...overrides,
});

const USER_ID = 'user-abc';
const CONTEXT = 'personal';

// ===========================================
// Tests
// ===========================================

describe('Core Memory Service', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // -------------------------------------------
  // Constants
  // -------------------------------------------

  describe('Constants', () => {
    it('should export CORE_BLOCK_TYPES with 4 types', () => {
      expect(CORE_BLOCK_TYPES).toHaveLength(4);
      expect(CORE_BLOCK_TYPES).toContain('user_profile');
      expect(CORE_BLOCK_TYPES).toContain('current_goals');
      expect(CORE_BLOCK_TYPES).toContain('preferences');
      expect(CORE_BLOCK_TYPES).toContain('working_context');
    });

    it('should export MAX_BLOCK_CHARS as 2000', () => {
      expect(MAX_BLOCK_CHARS).toBe(2000);
    });
  });

  // -------------------------------------------
  // getCoreMemoryBlocks
  // -------------------------------------------

  describe('getCoreMemoryBlocks', () => {
    it('should return all blocks for a user', async () => {
      const rows = [
        makeBlock({ block_type: 'user_profile', content: 'Profile content' }),
        makeBlock({ id: 'block-002', block_type: 'current_goals', content: 'Goals content' }),
      ];
      mockQueryContext.mockResolvedValueOnce({ rows, rowCount: 2 } as any);

      const result = await getCoreMemoryBlocks(CONTEXT, USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].blockType).toBe('user_profile');
      expect(result[0].content).toBe('Profile content');
      expect(result[1].blockType).toBe('current_goals');
      expect(mockQueryContext).toHaveBeenCalledWith(
        CONTEXT,
        expect.stringContaining('SELECT'),
        expect.arrayContaining([USER_ID])
      );
    });

    it('should return empty array for user with no blocks', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await getCoreMemoryBlocks(CONTEXT, USER_ID);

      expect(result).toEqual([]);
    });

    it('should map snake_case DB fields to camelCase', async () => {
      const dbRow = makeBlock({
        id: 'b-1',
        user_id: 'u-1',
        block_type: 'preferences',
        content: 'Prefers dark mode',
        version: 3,
        updated_by: 'agent',
        created_at: new Date('2026-02-01'),
        updated_at: new Date('2026-03-01'),
      });
      mockQueryContext.mockResolvedValueOnce({ rows: [dbRow], rowCount: 1 } as any);

      const [block] = await getCoreMemoryBlocks(CONTEXT, USER_ID);

      expect(block.id).toBe('b-1');
      expect(block.userId).toBe('u-1');
      expect(block.blockType).toBe('preferences');
      expect(block.content).toBe('Prefers dark mode');
      expect(block.version).toBe(3);
      expect(block.updatedBy).toBe('agent');
      expect(block.createdAt).toEqual(new Date('2026-02-01'));
      expect(block.updatedAt).toEqual(new Date('2026-03-01'));
    });
  });

  // -------------------------------------------
  // getCoreMemoryBlock
  // -------------------------------------------

  describe('getCoreMemoryBlock', () => {
    it('should return a single block by type', async () => {
      const row = makeBlock({ block_type: 'current_goals', content: 'Build ZenAI' });
      mockQueryContext.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

      const result = await getCoreMemoryBlock(CONTEXT, USER_ID, 'current_goals');

      expect(result).not.toBeNull();
      expect(result!.blockType).toBe('current_goals');
      expect(result!.content).toBe('Build ZenAI');
      expect(mockQueryContext).toHaveBeenCalledWith(
        CONTEXT,
        expect.stringContaining('block_type'),
        expect.arrayContaining([USER_ID, 'current_goals'])
      );
    });

    it('should return null if block does not exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await getCoreMemoryBlock(CONTEXT, USER_ID, 'working_context');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------
  // updateCoreMemoryBlock
  // -------------------------------------------

  describe('updateCoreMemoryBlock', () => {
    it('should create a new block via upsert', async () => {
      const newRow = makeBlock({
        block_type: 'user_profile',
        content: 'New profile content',
        version: 1,
        updated_by: 'user',
      });
      mockQueryContext.mockResolvedValueOnce({ rows: [newRow], rowCount: 1 } as any);

      const result = await updateCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', 'New profile content');

      expect(result.content).toBe('New profile content');
      expect(result.version).toBe(1);
      expect(mockQueryContext).toHaveBeenCalledWith(
        CONTEXT,
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
    });

    it('should increment version on update', async () => {
      const updatedRow = makeBlock({ version: 2, content: 'Updated profile' });
      mockQueryContext.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as any);

      const result = await updateCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', 'Updated profile');

      expect(result.version).toBe(2);
    });

    it('should truncate content exceeding MAX_BLOCK_CHARS', async () => {
      const longContent = 'x'.repeat(3000);
      const truncatedRow = makeBlock({ content: 'x'.repeat(MAX_BLOCK_CHARS) });
      mockQueryContext.mockResolvedValueOnce({ rows: [truncatedRow], rowCount: 1 } as any);

      await updateCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', longContent);

      const callArgs = mockQueryContext.mock.calls[0];
      const params = callArgs[2] as unknown[];
      // The content param passed to DB should be truncated
      const contentParam = params.find(p => typeof p === 'string' && (p as string).length <= MAX_BLOCK_CHARS);
      expect(contentParam).toBeDefined();
      // The long content must not appear in params
      expect(params.every(p => typeof p !== 'string' || (p as string).length <= MAX_BLOCK_CHARS)).toBe(true);
    });

    it('should use "user" as default updatedBy', async () => {
      const row = makeBlock({ updated_by: 'user' });
      mockQueryContext.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

      await updateCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', 'content');

      const callArgs = mockQueryContext.mock.calls[0];
      const params = callArgs[2] as unknown[];
      expect(params).toContain('user');
    });

    it('should accept custom updatedBy value', async () => {
      const row = makeBlock({ updated_by: 'agent' });
      mockQueryContext.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

      const result = await updateCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', 'content', 'agent');

      expect(result.updatedBy).toBe('agent');
    });

    it('should work for all block types', async () => {
      for (const blockType of CORE_BLOCK_TYPES) {
        mockQueryContext.mockResolvedValueOnce({
          rows: [makeBlock({ block_type: blockType })],
          rowCount: 1,
        } as any);
        const result = await updateCoreMemoryBlock(CONTEXT, USER_ID, blockType, 'content');
        expect(result).toBeDefined();
      }
    });
  });

  // -------------------------------------------
  // appendToCoreMemoryBlock
  // -------------------------------------------

  describe('appendToCoreMemoryBlock', () => {
    it('should append text to existing block', async () => {
      const existingRow = makeBlock({ content: 'Existing content.', version: 1 });
      const updatedRow = makeBlock({ content: 'Existing content. New text.', version: 2 });
      mockQueryContext
        .mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as any)  // getCoreMemoryBlock
        .mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as any); // updateCoreMemoryBlock

      const result = await appendToCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', ' New text.');

      expect(result.content).toBe('Existing content. New text.');
    });

    it('should create block if it does not exist', async () => {
      const newRow = makeBlock({ content: 'Fresh text.', version: 1 });
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)  // getCoreMemoryBlock returns null
        .mockResolvedValueOnce({ rows: [newRow], rowCount: 1 } as any); // updateCoreMemoryBlock

      const result = await appendToCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', 'Fresh text.');

      expect(result.content).toBe('Fresh text.');
    });

    it('should truncate from the beginning when combined length exceeds MAX_BLOCK_CHARS', async () => {
      const existingContent = 'A'.repeat(1900);
      const existingRow = makeBlock({ content: existingContent });
      const appendedText = ' ' + 'B'.repeat(200); // combined = 2101 > 2000

      mockQueryContext
        .mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [makeBlock({ content: 'truncated' })], rowCount: 1 } as any);

      await appendToCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', appendedText);

      // The content passed to updateCoreMemoryBlock should be <= MAX_BLOCK_CHARS
      const updateCall = mockQueryContext.mock.calls[1];
      const updateParams = updateCall[2] as unknown[];
      const contentParam = updateParams.find(
        p => typeof p === 'string' && p.length > 0 && p.length <= MAX_BLOCK_CHARS
      );
      expect(contentParam).toBeDefined();
    });

    it('should use "agent" as default updatedBy', async () => {
      const existingRow = makeBlock({ content: 'content', updated_by: 'agent' });
      mockQueryContext
        .mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as any);

      await appendToCoreMemoryBlock(CONTEXT, USER_ID, 'user_profile', ' more');

      // second call is the update — check that 'agent' is in params
      const updateCall = mockQueryContext.mock.calls[1];
      const updateParams = updateCall[2] as unknown[];
      expect(updateParams).toContain('agent');
    });
  });

  // -------------------------------------------
  // buildCoreMemoryPromptSection
  // -------------------------------------------

  describe('buildCoreMemoryPromptSection', () => {
    it('should return empty string when no blocks provided', () => {
      expect(buildCoreMemoryPromptSection([])).toBe('');
    });

    it('should return empty string when all blocks have empty content', () => {
      const blocks: CoreMemoryBlock[] = [
        makeBlock({ block_type: 'user_profile', content: '' }) as unknown as CoreMemoryBlock,
        makeBlock({ id: 'b-2', block_type: 'current_goals', content: '  ' }) as unknown as CoreMemoryBlock,
      ];
      expect(buildCoreMemoryPromptSection(blocks)).toBe('');
    });

    it('should include [KERN-GEDÄCHTNIS] header when blocks have content', () => {
      const blocks: CoreMemoryBlock[] = [
        {
          id: 'b-1',
          userId: USER_ID,
          blockType: 'user_profile',
          content: 'Alex, developer',
          version: 1,
          updatedBy: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const result = buildCoreMemoryPromptSection(blocks);
      expect(result).toContain('[KERN-GEDÄCHTNIS]');
    });

    it('should format user_profile as "## Benutzerprofil"', () => {
      const blocks: CoreMemoryBlock[] = [{
        id: 'b-1', userId: USER_ID, blockType: 'user_profile',
        content: 'Profile info', version: 1, updatedBy: 'user',
        createdAt: new Date(), updatedAt: new Date(),
      }];
      const result = buildCoreMemoryPromptSection(blocks);
      expect(result).toContain('## Benutzerprofil');
      expect(result).toContain('Profile info');
    });

    it('should format current_goals as "## Aktuelle Ziele"', () => {
      const blocks: CoreMemoryBlock[] = [{
        id: 'b-1', userId: USER_ID, blockType: 'current_goals',
        content: 'Build ZenAI', version: 1, updatedBy: 'user',
        createdAt: new Date(), updatedAt: new Date(),
      }];
      const result = buildCoreMemoryPromptSection(blocks);
      expect(result).toContain('## Aktuelle Ziele');
      expect(result).toContain('Build ZenAI');
    });

    it('should format preferences as "## Präferenzen"', () => {
      const blocks: CoreMemoryBlock[] = [{
        id: 'b-1', userId: USER_ID, blockType: 'preferences',
        content: 'Likes dark mode', version: 1, updatedBy: 'user',
        createdAt: new Date(), updatedAt: new Date(),
      }];
      const result = buildCoreMemoryPromptSection(blocks);
      expect(result).toContain('## Präferenzen');
      expect(result).toContain('Likes dark mode');
    });

    it('should format working_context as "## Arbeitskontext"', () => {
      const blocks: CoreMemoryBlock[] = [{
        id: 'b-1', userId: USER_ID, blockType: 'working_context',
        content: 'Working on Phase 126', version: 1, updatedBy: 'user',
        createdAt: new Date(), updatedAt: new Date(),
      }];
      const result = buildCoreMemoryPromptSection(blocks);
      expect(result).toContain('## Arbeitskontext');
      expect(result).toContain('Working on Phase 126');
    });

    it('should skip blocks with empty content', () => {
      const blocks: CoreMemoryBlock[] = [
        {
          id: 'b-1', userId: USER_ID, blockType: 'user_profile',
          content: 'Has content', version: 1, updatedBy: 'user',
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'b-2', userId: USER_ID, blockType: 'current_goals',
          content: '', version: 1, updatedBy: 'user',
          createdAt: new Date(), updatedAt: new Date(),
        },
      ];
      const result = buildCoreMemoryPromptSection(blocks);
      expect(result).toContain('## Benutzerprofil');
      expect(result).not.toContain('## Aktuelle Ziele');
    });

    it('should include all 4 blocks when all have content', () => {
      const blocks: CoreMemoryBlock[] = CORE_BLOCK_TYPES.map((bt, i) => ({
        id: `b-${i}`,
        userId: USER_ID,
        blockType: bt,
        content: `Content for ${bt}`,
        version: 1,
        updatedBy: 'user' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      const result = buildCoreMemoryPromptSection(blocks);
      expect(result).toContain('## Benutzerprofil');
      expect(result).toContain('## Aktuelle Ziele');
      expect(result).toContain('## Präferenzen');
      expect(result).toContain('## Arbeitskontext');
    });
  });

  // -------------------------------------------
  // initializeDefaultBlocks
  // -------------------------------------------

  describe('initializeDefaultBlocks', () => {
    it('should insert all 4 block types', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await initializeDefaultBlocks(CONTEXT, USER_ID);

      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('ON CONFLICT');
      // All 4 block types should appear in the params
      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      for (const blockType of CORE_BLOCK_TYPES) {
        expect(params).toContain(blockType);
      }
    });

    it('should use ON CONFLICT DO NOTHING for idempotency', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await initializeDefaultBlocks(CONTEXT, USER_ID);

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql.toUpperCase()).toContain('ON CONFLICT');
      expect(sql.toUpperCase()).toContain('DO NOTHING');
    });

    it('should work for all context types', async () => {
      for (const ctx of ['personal', 'work', 'learning', 'creative']) {
        mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
        await expect(initializeDefaultBlocks(ctx, USER_ID)).resolves.toBeUndefined();
      }
    });
  });
});
