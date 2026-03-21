/**
 * Unit Tests for Tasks Service
 *
 * Tests task CRUD, dependencies, reorder, Gantt, and idea conversion.
 */

import { queryContext } from '../../../utils/database-context';
import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  reorderTasks,
  addDependency,
  removeDependency,
  getTaskDependencies,
  getTasksForGantt,
  convertIdeaToTask,
} from '../../../services/tasks';

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

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-task-uuid'),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Mock Data
// ===========================================

const mockTaskRow = {
  id: 'task-001',
  title: 'Build feature',
  description: 'Implement new feature',
  status: 'todo',
  priority: 'high',
  project_id: 'proj-001',
  source_idea_id: null,
  calendar_event_id: null,
  due_date: '2026-04-01',
  start_date: '2026-03-20',
  completed_at: null,
  assignee: 'Alice',
  estimated_hours: 8,
  actual_hours: null,
  sort_order: 0,
  context: 'work',
  labels: '["frontend","urgent"]',
  metadata: '{}',
  created_at: new Date('2026-03-20T10:00:00Z'),
  updated_at: new Date('2026-03-20T10:00:00Z'),
  project_name: 'Project Alpha',
  project_color: '#3b82f6',
  user_id: '00000000-0000-0000-0000-000000000001',
};

const mockDependencyRow = {
  id: 'dep-001',
  task_id: 'task-001',
  depends_on_id: 'task-002',
  dependency_type: 'finish_to_start',
  created_at: new Date('2026-03-20T10:00:00Z'),
  task_title: 'Build feature',
  depends_on_title: 'Design mockup',
};

// ===========================================
// Tests
// ===========================================

describe('Tasks Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('createTask', () => {
    it('should create a task with defaults', async () => {
      // max sort_order query
      mockQueryContext.mockResolvedValueOnce({ rows: [{ next_order: '0' }], rowCount: 1 } as any);
      // insert query
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      const result = await createTask('work', { title: 'Build feature' });

      expect(result.id).toBe('task-001');
      expect(result.title).toBe('Build feature');
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('should use specified status and priority', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ next_order: '3' }], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, status: 'in_progress', priority: 'urgent' }], rowCount: 1 } as any);

      const result = await createTask('work', {
        title: 'Urgent task',
        status: 'in_progress',
        priority: 'urgent',
      });

      expect(result.status).toBe('in_progress');
      expect(result.priority).toBe('urgent');
    });

    it('should pass userId for user isolation', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ next_order: '0' }], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      await createTask('work', { title: 'User task' }, 'user-abc');

      const firstCallSql = mockQueryContext.mock.calls[0][1] as string;
      expect(firstCallSql).toContain('user_id');
    });
  });

  describe('getTasks', () => {
    it('should return tasks excluding cancelled', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      const result = await getTasks('work');

      expect(result).toHaveLength(1);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain("status != 'cancelled'");
    });

    it('should filter by project_id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await getTasks('work', { project_id: 'proj-001' });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('t.project_id =');
    });

    it('should filter by due date range', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await getTasks('work', { due_before: '2026-04-01', due_after: '2026-03-01' });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('t.due_date <=');
      expect(sql).toContain('t.due_date >=');
    });

    it('should respect limit with max cap of 500', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await getTasks('work', { limit: 1000 });

      const params = mockQueryContext.mock.calls[0][2] as number[];
      expect(params[params.length - 2]).toBe(500); // capped limit
    });
  });

  describe('getTask', () => {
    it('should return a task by id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockTaskRow], rowCount: 1 } as any);

      const result = await getTask('work', 'task-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('task-001');
    });

    it('should return null for non-existent task', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await getTask('work', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateTask', () => {
    it('should auto-set completed_at when status is done', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, status: 'done' }], rowCount: 1 } as any);

      await updateTask('work', 'task-001', { status: 'done' });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('completed_at =');
    });

    it('should clear completed_at when moving away from done', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockTaskRow, status: 'in_progress' }], rowCount: 1 } as any);

      await updateTask('work', 'task-001', { status: 'in_progress' });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('completed_at = NULL');
    });

    it('should return null if no task found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await updateTask('work', 'nonexistent', { title: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('deleteTask', () => {
    it('should mark task as cancelled', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'task-001' }], rowCount: 1 } as any);

      const result = await deleteTask('work', 'task-001');

      expect(result).toBe(true);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain("status = 'cancelled'");
    });

    it('should return false if task not found or already cancelled', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await deleteTask('work', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('reorderTasks', () => {
    it('should do nothing for empty task list', async () => {
      await reorderTasks('work', 'todo', []);

      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should batch update sort orders', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 3 } as any);

      await reorderTasks('work', 'todo', ['task-1', 'task-2', 'task-3']);

      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('unnest');
      expect(sql).toContain('sort_order');
    });
  });

  describe('addDependency', () => {
    it('should detect circular dependencies', async () => {
      // Owner check passes
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'task-1' }, { id: 'task-2' }], rowCount: 2 } as any);
      // Cycle detected
      mockQueryContext.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as any);

      await expect(
        addDependency('work', 'task-1', 'task-2', 'finish_to_start', 'user-1')
      ).rejects.toThrow('Circular dependency detected');
    });

    it('should create dependency when no cycle exists', async () => {
      // No cycle
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // Insert
      mockQueryContext.mockResolvedValueOnce({ rows: [mockDependencyRow], rowCount: 1 } as any);

      const result = await addDependency('work', 'task-001', 'task-002');

      expect(result.task_id).toBe('task-001');
      expect(result.depends_on_id).toBe('task-002');
    });
  });

  describe('removeDependency', () => {
    it('should return true when dependency is deleted', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'dep-001' }], rowCount: 1 } as any);

      const result = await removeDependency('work', 'dep-001');

      expect(result).toBe(true);
    });

    it('should return false when dependency not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await removeDependency('work', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('convertIdeaToTask', () => {
    it('should convert an idea to a task', async () => {
      // Read idea
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'idea-1', title: 'Idea Title', summary: 'Idea summary', priority: 'high' }],
        rowCount: 1,
      } as any);
      // createTask: max sort_order
      mockQueryContext.mockResolvedValueOnce({ rows: [{ next_order: '0' }], rowCount: 1 } as any);
      // createTask: insert
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockTaskRow, title: 'Idea Title', source_idea_id: 'idea-1' }],
        rowCount: 1,
      } as any);

      const result = await convertIdeaToTask('work', 'idea-1');

      expect(result.title).toBe('Idea Title');
      expect(result.source_idea_id).toBe('idea-1');
    });

    it('should throw when idea is not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(convertIdeaToTask('work', 'nonexistent')).rejects.toThrow('Idea not found');
    });
  });
});
