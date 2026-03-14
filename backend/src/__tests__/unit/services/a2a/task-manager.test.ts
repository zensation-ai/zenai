/**
 * Tests for A2A Task Manager
 */

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx)),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../../services/agent-orchestrator', () => ({
  executeTeamTask: jest.fn(),
}));

import { A2ATaskManager } from '../../../../services/a2a/task-manager';
import { queryContext } from '../../../../utils/database-context';
import { executeTeamTask } from '../../../../services/agent-orchestrator';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockExecuteTeamTask = executeTeamTask as jest.MockedFunction<typeof executeTeamTask>;

describe('A2ATaskManager', () => {
  let manager: A2ATaskManager;

  const mockTaskRow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    external_task_id: null,
    skill_id: 'research',
    status: 'submitted',
    message: { role: 'user', parts: [{ type: 'text', text: 'Research AI trends' }] },
    artifacts: [],
    metadata: {},
    error_message: null,
    caller_agent_url: null,
    caller_agent_name: null,
    auth_method: 'bearer',
    execution_id: null,
    tokens_used: 0,
    created_at: '2026-03-14T00:00:00Z',
    updated_at: '2026-03-14T00:00:00Z',
    completed_at: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    manager = new A2ATaskManager();
  });

  describe('createTask', () => {
    it('should create a task and return it', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);
      // processTask calls - update to working, then orchestrator runs async
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const task = await manager.createTask('personal' as any, {
        skill_id: 'research',
        message: { role: 'user', parts: [{ type: 'text', text: 'Research AI trends' }] },
      });

      expect(task.id).toBe(mockTaskRow.id);
      expect(task.skill_id).toBe('research');
      expect(task.status).toBe('submitted');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO a2a_tasks'),
        expect.any(Array)
      );
    });

    it('should throw for invalid skill_id', async () => {
      await expect(
        manager.createTask('personal' as any, {
          skill_id: 'invalid-skill',
          message: { role: 'user', parts: [{ type: 'text', text: 'test' }] },
        })
      ).rejects.toThrow('Invalid skill_id');
    });

    it('should start async processing after creation', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);
      // processTask: update to working
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // processTask: update to completed
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      mockExecuteTeamTask.mockResolvedValueOnce({
        teamId: 'team-1',
        success: true,
        finalOutput: 'Research results',
        agentResults: [],
        executionTimeMs: 1000,
        strategy: 'research_only',
        totalTokens: { input: 100, output: 200 },
        memoryStats: { totalEntries: 0, byAgent: {} },
      });

      await manager.createTask('personal' as any, {
        skill_id: 'research',
        message: { role: 'user', parts: [{ type: 'text', text: 'Research AI trends' }] },
      });

      // Allow async processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockExecuteTeamTask).toHaveBeenCalled();
    });

    it('should include optional fields when provided', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await manager.createTask('personal' as any, {
        skill_id: 'research',
        message: { role: 'user', parts: [{ type: 'text', text: 'test' }] },
        metadata: { key: 'value' },
        caller_agent_url: 'https://agent.example.com',
        caller_agent_name: 'TestAgent',
        external_task_id: 'ext-123',
      });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining(['research', expect.any(String), expect.any(String), 'https://agent.example.com', 'TestAgent', 'ext-123'])
      );
    });
  });

  describe('getTask', () => {
    it('should return a task by ID', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      const task = await manager.getTask('personal' as any, mockTaskRow.id);

      expect(task).not.toBeNull();
      expect(task!.id).toBe(mockTaskRow.id);
      expect(task!.skill_id).toBe('research');
    });

    it('should return null when task not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const task = await manager.getTask('personal' as any, 'nonexistent');

      expect(task).toBeNull();
    });
  });

  describe('listTasks', () => {
    it('should list tasks without filters', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow, { ...mockTaskRow, id: '456' }], rowCount: 2 } as any);

      const tasks = await manager.listTasks('personal' as any);

      expect(tasks).toHaveLength(2);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should apply status filter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      await manager.listTasks('personal' as any, { status: 'submitted' });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('status = $1'),
        expect.arrayContaining(['submitted'])
      );
    });

    it('should apply skill_id filter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      await manager.listTasks('personal' as any, { skill_id: 'research' });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('skill_id = $1'),
        expect.arrayContaining(['research'])
      );
    });

    it('should apply limit and offset', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await manager.listTasks('personal' as any, { limit: 10, offset: 20 });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([10, 20])
      );
    });

    it('should apply multiple filters', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await manager.listTasks('personal' as any, { status: 'working', skill_id: 'research' });

      const call = mockQueryContext.mock.calls[0];
      expect(call[1]).toContain('status = $1');
      expect(call[1]).toContain('skill_id = $2');
    });
  });

  describe('cancelTask', () => {
    it('should cancel a submitted task', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: mockTaskRow.id }], rowCount: 1 } as any);

      await expect(manager.cancelTask('personal' as any, mockTaskRow.id)).resolves.not.toThrow();

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'canceled'"),
        [mockTaskRow.id]
      );
    });

    it('should throw when task not found or already terminal', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(
        manager.cancelTask('personal' as any, 'nonexistent')
      ).rejects.toThrow('not found or cannot be canceled');
    });
  });

  describe('sendMessage', () => {
    it('should send a follow-up message', async () => {
      // getTask
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, status: 'working' }], rowCount: 1 } as any);
      // update metadata
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
      // getTask again
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, status: 'working' }], rowCount: 1 } as any);

      const result = await manager.sendMessage(
        'personal' as any,
        mockTaskRow.id,
        { role: 'user', parts: [{ type: 'text', text: 'Additional context' }] }
      );

      expect(result).toBeTruthy();
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('UPDATE a2a_tasks SET metadata'),
        expect.any(Array)
      );
    });

    it('should throw for nonexistent task', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(
        manager.sendMessage(
          'personal' as any,
          'nonexistent',
          { role: 'user', parts: [{ type: 'text', text: 'test' }] }
        )
      ).rejects.toThrow('not found');
    });

    it('should throw for terminal state task', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, status: 'completed' }], rowCount: 1 } as any);

      await expect(
        manager.sendMessage(
          'personal' as any,
          mockTaskRow.id,
          { role: 'user', parts: [{ type: 'text', text: 'test' }] }
        )
      ).rejects.toThrow('terminal state');
    });
  });

  describe('processTask (via createTask)', () => {
    it('should map research skill to research_only strategy', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // update to working
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // update to completed

      mockExecuteTeamTask.mockResolvedValueOnce({
        teamId: 'team-1',
        success: true,
        finalOutput: 'Results',
        agentResults: [],
        executionTimeMs: 500,
        strategy: 'research_only',
        totalTokens: { input: 50, output: 100 },
        memoryStats: { totalEntries: 0, byAgent: {} },
      });

      await manager.createTask('personal' as any, {
        skill_id: 'research',
        message: { role: 'user', parts: [{ type: 'text', text: 'Test' }] },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockExecuteTeamTask).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy: 'research_only',
          aiContext: 'personal',
        })
      );
    });

    it('should map code-review skill to research_code_review strategy', async () => {
      const codeReviewRow = { ...mockTaskRow, skill_id: 'code-review' };
      mockQueryContext.mockResolvedValueOnce({ rows: [codeReviewRow], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      mockExecuteTeamTask.mockResolvedValueOnce({
        teamId: 'team-2',
        success: true,
        finalOutput: 'Code review results',
        agentResults: [],
        executionTimeMs: 500,
        strategy: 'research_code_review',
        totalTokens: { input: 50, output: 100 },
        memoryStats: { totalEntries: 0, byAgent: {} },
      });

      await manager.createTask('personal' as any, {
        skill_id: 'code-review',
        message: { role: 'user', parts: [{ type: 'text', text: 'Review this code' }] },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockExecuteTeamTask).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'research_code_review' })
      );
    });

    it('should map content-creation skill to research_write_review strategy', async () => {
      const contentRow = { ...mockTaskRow, skill_id: 'content-creation' };
      mockQueryContext.mockResolvedValueOnce({ rows: [contentRow], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      mockExecuteTeamTask.mockResolvedValueOnce({
        teamId: 'team-3',
        success: true,
        finalOutput: 'Article',
        agentResults: [],
        executionTimeMs: 500,
        strategy: 'research_write_review',
        totalTokens: { input: 50, output: 100 },
        memoryStats: { totalEntries: 0, byAgent: {} },
      });

      await manager.createTask('personal' as any, {
        skill_id: 'content-creation',
        message: { role: 'user', parts: [{ type: 'text', text: 'Write article' }] },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockExecuteTeamTask).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: 'research_write_review' })
      );
    });

    it('should handle orchestrator errors by marking task as failed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // update to working
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // update to failed

      mockExecuteTeamTask.mockRejectedValueOnce(new Error('Orchestrator crashed'));

      await manager.createTask('personal' as any, {
        skill_id: 'research',
        message: { role: 'user', parts: [{ type: 'text', text: 'Test' }] },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have called update with 'failed' status
      const failedCall = mockQueryContext.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes("status = 'failed'")
      );
      expect(failedCall).toBeTruthy();
    });
  });

  describe('task lifecycle', () => {
    it('should transition submitted -> working -> completed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // working
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // completed

      mockExecuteTeamTask.mockResolvedValueOnce({
        teamId: 'team-1',
        success: true,
        finalOutput: 'Done',
        agentResults: [],
        executionTimeMs: 500,
        strategy: 'research_only',
        totalTokens: { input: 50, output: 100 },
        memoryStats: { totalEntries: 0, byAgent: {} },
      });

      await manager.createTask('personal' as any, {
        skill_id: 'research',
        message: { role: 'user', parts: [{ type: 'text', text: 'Test' }] },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify working status update
      const workingCall = mockQueryContext.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes("status = 'working'")
      );
      expect(workingCall).toBeTruthy();

      // Verify completed status update
      const completedCall = mockQueryContext.mock.calls.find(
        call => typeof call[1] === 'string' && call[1].includes("status = 'completed'")
      );
      expect(completedCall).toBeTruthy();
    });
  });
});
