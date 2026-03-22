/**
 * Phase 129: Persistent Agent Loop Tests
 *
 * Tests the persistent agent task lifecycle:
 * - createTask, getTask, listActiveTasks
 * - advanceStep, failStep, pauseTask, resumeTask, completeTask
 * - Pure helpers: isExpired, getNextExecutableStep
 */

// ===========================================
// Mocks - must be before imports
// ===========================================

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-task-uuid'),
}));

// ===========================================
// Imports (after mocks)
// ===========================================

import { queryContext } from '../../../../utils/database-context';
import {
  createTask,
  getTask,
  listActiveTasks,
  advanceStep,
  failStep,
  pauseTask,
  resumeTask,
  completeTask,
  isExpired,
  getNextExecutableStep,
  PersistentAgentTask,
  AgentPlan,
  PlannedStep,
  TaskStatus,
} from '../../../../services/agents/persistent-loop';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Mock Data Helpers
// ===========================================

function makePlan(steps: Partial<PlannedStep>[]): AgentPlan {
  return {
    steps: steps.map((s, i) => ({
      stepNumber: i + 1,
      description: `Step ${i + 1}`,
      tools: [],
      dependsOn: [],
      status: 'pending',
      ...s,
    })),
    estimatedDuration: '10 minutes',
    requiredTools: [],
  };
}

function makeTaskRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const plan = makePlan([
    { stepNumber: 1, description: 'Research', tools: ['web_search'] },
    { stepNumber: 2, description: 'Write', tools: ['draft_email'], dependsOn: [1] },
  ]);
  return {
    id: 'task-001',
    user_id: 'user-001',
    goal: 'Write a blog post about AI',
    plan: JSON.stringify(plan),
    current_step: 1,
    status: 'executing',
    context: 'work',
    results: JSON.stringify([]),
    max_steps: 20,
    max_duration_minutes: 60,
    created_at: new Date('2026-03-22T10:00:00Z'),
    last_activity_at: new Date('2026-03-22T10:05:00Z'),
    ...overrides,
  };
}

function makeTask(overrides: Partial<PersistentAgentTask> = {}): PersistentAgentTask {
  const plan = makePlan([
    { stepNumber: 1, description: 'Research', tools: ['web_search'] },
    { stepNumber: 2, description: 'Write', tools: ['draft_email'], dependsOn: [1] },
  ]);
  return {
    id: 'task-001',
    userId: 'user-001',
    goal: 'Write a blog post about AI',
    plan,
    currentStep: 1,
    status: 'executing',
    context: 'work',
    results: [],
    maxSteps: 20,
    maxDurationMinutes: 60,
    createdAt: new Date('2026-03-22T10:00:00Z'),
    lastActivityAt: new Date('2026-03-22T10:05:00Z'),
    ...overrides,
  };
}

// ===========================================
// Tests
// ===========================================

describe('PersistentAgentLoop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (require('uuid').v4 as jest.Mock).mockReturnValue('mock-task-uuid');
  });

  // --------------- createTask ---------------

  describe('createTask', () => {
    it('creates task with default maxSteps and maxDuration', async () => {
      const plan = makePlan([{ stepNumber: 1, description: 'Do research' }]);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'mock-task-uuid' }] } as any);

      const id = await createTask('work', 'user-001', 'My goal', plan);

      expect(id).toBe('mock-task-uuid');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('INSERT'),
        expect.arrayContaining(['mock-task-uuid', 'user-001', 'My goal']),
      );
      // Verify defaults: maxSteps=20, maxDuration=60
      const callArgs = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(callArgs).toContain(20);
      expect(callArgs).toContain(60);
    });

    it('creates task with custom maxSteps and maxDuration', async () => {
      const plan = makePlan([{ stepNumber: 1, description: 'Do research' }]);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'mock-task-uuid' }] } as any);

      const id = await createTask('personal', 'user-002', 'Custom goal', plan, 10, 30);

      expect(id).toBe('mock-task-uuid');
      const callArgs = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(callArgs).toContain(10);
      expect(callArgs).toContain(30);
    });

    it('inserts with status planning', async () => {
      const plan = makePlan([]);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'mock-task-uuid' }] } as any);

      await createTask('work', 'user-001', 'goal', plan);

      const callArgs = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(callArgs).toContain('planning');
    });
  });

  // --------------- getTask ---------------

  describe('getTask', () => {
    it('returns parsed task when found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeTaskRow()] } as any);

      const task = await getTask('work', 'task-001');

      expect(task).not.toBeNull();
      expect(task!.id).toBe('task-001');
      expect(task!.userId).toBe('user-001');
      expect(task!.goal).toBe('Write a blog post about AI');
      expect(task!.status).toBe('executing');
      expect(task!.plan.steps).toHaveLength(2);
      expect(Array.isArray(task!.results)).toBe(true);
    });

    it('returns null when task not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const task = await getTask('work', 'nonexistent');

      expect(task).toBeNull();
    });

    it('queries by taskId', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await getTask('learning', 'task-xyz');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'learning',
        expect.any(String),
        expect.arrayContaining(['task-xyz']),
      );
    });
  });

  // --------------- listActiveTasks ---------------

  describe('listActiveTasks', () => {
    it('returns list of active tasks for user', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeTaskRow(), makeTaskRow({ id: 'task-002', status: 'paused' })],
      } as any);

      const tasks = await listActiveTasks('work', 'user-001');

      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('task-001');
      expect(tasks[1].id).toBe('task-002');
    });

    it('returns empty array when no active tasks', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const tasks = await listActiveTasks('work', 'user-001');

      expect(tasks).toEqual([]);
    });

    it('filters by userId and excludes completed/failed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await listActiveTasks('personal', 'user-abc');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('user_id'),
        expect.arrayContaining(['user-abc']),
      );
      // Query should exclude completed and failed
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toMatch(/completed|failed/);
    });
  });

  // --------------- advanceStep ---------------

  describe('advanceStep', () => {
    it('marks current step completed and returns next executable step', async () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'running' },
        { stepNumber: 2, description: 'Step 2', dependsOn: [1], status: 'pending' },
      ]);
      const taskRow = makeTaskRow({ plan: JSON.stringify(plan), current_step: 1 });
      mockQueryContext.mockResolvedValueOnce({ rows: [taskRow] } as any); // getTask
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // UPDATE

      const nextStep = await advanceStep('work', 'task-001', 'Step 1 result');

      expect(nextStep).not.toBeNull();
      expect(nextStep!.stepNumber).toBe(2);
      expect(nextStep!.status).toBe('running');
    });

    it('returns null when all steps are done', async () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'running' },
      ]);
      const taskRow = makeTaskRow({ plan: JSON.stringify(plan), current_step: 1 });
      mockQueryContext.mockResolvedValueOnce({ rows: [taskRow] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const nextStep = await advanceStep('work', 'task-001', 'Done');

      expect(nextStep).toBeNull();
    });

    it('respects dependencies — skips step whose deps are not completed', async () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'running' },
        { stepNumber: 2, description: 'Step 2', dependsOn: [3], status: 'pending' },
        { stepNumber: 3, description: 'Step 3', dependsOn: [], status: 'pending' },
      ]);
      const taskRow = makeTaskRow({ plan: JSON.stringify(plan), current_step: 1 });
      mockQueryContext.mockResolvedValueOnce({ rows: [taskRow] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const nextStep = await advanceStep('work', 'task-001', 'Done');

      // Step 2 depends on step 3 (pending), so step 3 should be next
      expect(nextStep).not.toBeNull();
      expect(nextStep!.stepNumber).toBe(3);
    });

    it('updates lastActivityAt', async () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'running' },
      ]);
      const taskRow = makeTaskRow({ plan: JSON.stringify(plan), current_step: 1 });
      mockQueryContext.mockResolvedValueOnce({ rows: [taskRow] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await advanceStep('work', 'task-001', 'Done');

      // The UPDATE query should be called
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
      const updateSql = mockQueryContext.mock.calls[1][1] as string;
      expect(updateSql).toMatch(/UPDATE|last_activity_at/i);
    });

    it('returns null when task not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const nextStep = await advanceStep('work', 'nonexistent', 'Done');

      expect(nextStep).toBeNull();
    });
  });

  // --------------- failStep ---------------

  describe('failStep', () => {
    it('marks current step as failed and sets task status to failed', async () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'running' },
      ]);
      const taskRow = makeTaskRow({ plan: JSON.stringify(plan), current_step: 1 });
      mockQueryContext.mockResolvedValueOnce({ rows: [taskRow] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await failStep('work', 'task-001', 'Something went wrong');

      expect(mockQueryContext).toHaveBeenCalledTimes(2);
      const updateCall = mockQueryContext.mock.calls[1];
      const sql = updateCall[1] as string;
      const params = updateCall[2] as unknown[];
      expect(sql).toMatch(/UPDATE/i);
      expect(params).toContain('failed');
      // Error message is embedded in the serialised plan JSON
      const planJson = params.find((p) => typeof p === 'string' && p.includes('Something went wrong'));
      expect(planJson).toBeDefined();
    });

    it('does nothing when task not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await expect(failStep('work', 'nonexistent', 'error')).resolves.toBeUndefined();

      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });
  });

  // --------------- pauseTask ---------------

  describe('pauseTask', () => {
    it('sets task status to paused', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await pauseTask('work', 'task-001');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['paused', 'task-001']),
      );
    });
  });

  // --------------- resumeTask ---------------

  describe('resumeTask', () => {
    it('sets status to executing and returns current pending step', async () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'completed' },
        { stepNumber: 2, description: 'Step 2', dependsOn: [1], status: 'pending' },
      ]);
      const taskRow = makeTaskRow({ plan: JSON.stringify(plan), current_step: 2, status: 'paused' });
      mockQueryContext.mockResolvedValueOnce({ rows: [taskRow] } as any); // getTask
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // UPDATE

      const step = await resumeTask('work', 'task-001');

      expect(step).not.toBeNull();
      expect(step!.stepNumber).toBe(2);
      const updateCall = mockQueryContext.mock.calls[1];
      expect(updateCall[2]).toContain('executing');
    });

    it('returns null when task not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const step = await resumeTask('work', 'nonexistent');

      expect(step).toBeNull();
    });

    it('returns null when no executable step exists after resume', async () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'completed' },
      ]);
      const taskRow = makeTaskRow({ plan: JSON.stringify(plan), current_step: 1, status: 'paused' });
      mockQueryContext.mockResolvedValueOnce({ rows: [taskRow] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const step = await resumeTask('work', 'task-001');

      expect(step).toBeNull();
    });
  });

  // --------------- completeTask ---------------

  describe('completeTask', () => {
    it('marks task as completed with final result', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await completeTask('work', 'task-001', 'Final answer here');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['completed', 'task-001']),
      );
      // The result is JSON-serialised into the results array
      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params.some((p) => typeof p === 'string' && p.includes('Final answer here'))).toBe(true);
    });
  });

  // --------------- isExpired ---------------

  describe('isExpired', () => {
    it('returns false when task is within maxDurationMinutes', () => {
      const task = makeTask({
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
        maxDurationMinutes: 60,
      });

      expect(isExpired(task)).toBe(false);
    });

    it('returns true when task has exceeded maxDurationMinutes', () => {
      const task = makeTask({
        createdAt: new Date(Date.now() - 90 * 60 * 1000), // 90 min ago
        maxDurationMinutes: 60,
      });

      expect(isExpired(task)).toBe(true);
    });

    it('returns false for a brand-new task', () => {
      const task = makeTask({
        createdAt: new Date(),
        maxDurationMinutes: 60,
      });

      expect(isExpired(task)).toBe(false);
    });

    it('returns true when exactly at expiry boundary + 1ms', () => {
      const task = makeTask({
        createdAt: new Date(Date.now() - 60 * 60 * 1000 - 1),
        maxDurationMinutes: 60,
      });

      expect(isExpired(task)).toBe(true);
    });
  });

  // --------------- getNextExecutableStep ---------------

  describe('getNextExecutableStep', () => {
    it('returns first pending step with no dependencies', () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'pending', dependsOn: [] },
        { stepNumber: 2, description: 'Step 2', status: 'pending', dependsOn: [1] },
      ]);

      const next = getNextExecutableStep(plan);

      expect(next).not.toBeNull();
      expect(next!.stepNumber).toBe(1);
    });

    it('returns null when all steps are completed', () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'completed' },
        { stepNumber: 2, description: 'Step 2', status: 'completed' },
      ]);

      const next = getNextExecutableStep(plan);

      expect(next).toBeNull();
    });

    it('returns null when all steps are done or in progress', () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'completed' },
        { stepNumber: 2, description: 'Step 2', status: 'running' },
        { stepNumber: 3, description: 'Step 3', status: 'pending', dependsOn: [2] },
      ]);

      const next = getNextExecutableStep(plan);

      // Step 3 can't run until step 2 is done; step 2 is running, not completed
      expect(next).toBeNull();
    });

    it('skips steps whose dependencies are not completed', () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'completed' },
        { stepNumber: 2, description: 'Step 2', status: 'pending', dependsOn: [3] },
        { stepNumber: 3, description: 'Step 3', status: 'pending', dependsOn: [] },
      ]);

      const next = getNextExecutableStep(plan);

      // Step 2 depends on step 3 (not completed), so step 3 should be returned
      expect(next!.stepNumber).toBe(3);
    });

    it('handles complex dependency chains', () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'completed' },
        { stepNumber: 2, description: 'Step 2', status: 'completed' },
        { stepNumber: 3, description: 'Step 3', status: 'pending', dependsOn: [1, 2] },
        { stepNumber: 4, description: 'Step 4', status: 'pending', dependsOn: [3] },
      ]);

      const next = getNextExecutableStep(plan);

      // Steps 1 & 2 done — step 3 is now executable
      expect(next!.stepNumber).toBe(3);
    });

    it('returns null for empty plan', () => {
      const plan: AgentPlan = { steps: [], estimatedDuration: '0', requiredTools: [] };

      const next = getNextExecutableStep(plan);

      expect(next).toBeNull();
    });

    it('ignores failed steps in dependency resolution', () => {
      const plan = makePlan([
        { stepNumber: 1, description: 'Step 1', status: 'failed' },
        { stepNumber: 2, description: 'Step 2', status: 'pending', dependsOn: [1] },
        { stepNumber: 3, description: 'Step 3', status: 'pending', dependsOn: [] },
      ]);

      const next = getNextExecutableStep(plan);

      // Step 2 depends on failed step 1 — not eligible. Step 3 has no deps.
      expect(next!.stepNumber).toBe(3);
    });
  });
});
