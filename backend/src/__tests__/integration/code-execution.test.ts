/**
 * Integration Tests for Code Execution API
 *
 * Tests the code execution routes:
 * - POST /api/code/execute   - Execute code from task description
 * - POST /api/code/run       - Execute pre-written code directly
 * - POST /api/code/validate  - Validate code safety
 * - GET  /api/code/health    - Service health check
 * - GET  /api/code/languages - List supported languages
 */

import express, { Express } from 'express';
import request from 'supertest';

// Mock dependencies BEFORE imports
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockExecuteCodeFromTask = jest.fn();
const mockExecuteCodeDirect = jest.fn();
const mockCheckHealth = jest.fn();
const mockValidateCode = jest.fn();

jest.mock('../../services/code-execution', () => ({
  executeCodeFromTask: (...args: unknown[]) => mockExecuteCodeFromTask(...args),
  executeCodeDirect: (...args: unknown[]) => mockExecuteCodeDirect(...args),
  checkCodeExecutionHealth: (...args: unknown[]) => mockCheckHealth(...args),
  validateCode: (...args: unknown[]) => mockValidateCode(...args),
  isCodeExecutionEnabled: jest.fn(() => true),
  isSupportedLanguage: jest.fn((lang: string) => ['python', 'nodejs', 'bash'].includes(lang)),
  LANGUAGE_CONFIGS: {
    python: { displayName: 'Python 3.11', extension: '.py', availablePackages: ['numpy'] },
    nodejs: { displayName: 'Node.js 20', extension: '.js', availablePackages: [] },
    bash: { displayName: 'Bash', extension: '.sh', availablePackages: [] },
  },
  SupportedLanguage: {},
  MAX_CODE_LENGTH: 100000,
  MAX_INPUT_DATA_LENGTH: 50000,
}));

import { codeExecutionRouter } from '../../routes/code-execution';
import { errorHandler } from '../../middleware/errorHandler';

describe('Code Execution API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/code', codeExecutionRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // POST /api/code/execute
  // ============================================================

  describe('POST /api/code/execute', () => {
    it('should execute code from task description', async () => {
      mockExecuteCodeFromTask.mockResolvedValueOnce({
        success: true,
        output: '42\n',
        generatedCode: 'print(42)',
        language: 'python',
        executionTime: 150,
      });

      const response = await request(app)
        .post('/api/code/execute')
        .send({ task: 'Calculate the answer to life', language: 'python' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.output).toBe('42\n');
      expect(response.body.generatedCode).toBe('print(42)');
    });

    it('should return 400 for failed execution', async () => {
      mockExecuteCodeFromTask.mockResolvedValueOnce({
        success: false,
        error: 'Syntax error',
      });

      const response = await request(app)
        .post('/api/code/execute')
        .send({ task: 'broken code', language: 'python' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing task', async () => {
      const response = await request(app)
        .post('/api/code/execute')
        .send({ language: 'python' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing language', async () => {
      const response = await request(app)
        .post('/api/code/execute')
        .send({ task: 'do something' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject unsupported language', async () => {
      const response = await request(app)
        .post('/api/code/execute')
        .send({ task: 'test', language: 'ruby' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Unsupported language');
    });

    it('should reject overly long task description', async () => {
      const response = await request(app)
        .post('/api/code/execute')
        .send({ task: 'a'.repeat(5001), language: 'python' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/code/run
  // ============================================================

  describe('POST /api/code/run', () => {
    it('should execute pre-written code', async () => {
      mockExecuteCodeDirect.mockResolvedValueOnce({
        success: true,
        output: 'hello\n',
        executionTime: 50,
      });

      const response = await request(app)
        .post('/api/code/run')
        .send({ code: 'print("hello")', language: 'python' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.output).toBe('hello\n');
    });

    it('should reject missing code', async () => {
      const response = await request(app)
        .post('/api/code/run')
        .send({ language: 'python' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing language', async () => {
      const response = await request(app)
        .post('/api/code/run')
        .send({ code: 'print(1)' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // POST /api/code/validate
  // ============================================================

  describe('POST /api/code/validate', () => {
    it('should validate safe code', async () => {
      mockValidateCode.mockReturnValueOnce({
        safe: true,
        score: 95,
        violations: [],
        warnings: [],
      });

      const response = await request(app)
        .post('/api/code/validate')
        .send({ code: 'print("hello")', language: 'python' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.safe).toBe(true);
      expect(response.body.score).toBe(95);
      expect(response.body.violations).toHaveLength(0);
    });

    it('should detect unsafe code', async () => {
      mockValidateCode.mockReturnValueOnce({
        safe: false,
        score: 20,
        violations: ['os.system call detected'],
        warnings: ['Uses subprocess module'],
      });

      const response = await request(app)
        .post('/api/code/validate')
        .send({ code: 'import os; os.system("rm -rf /")', language: 'python' })
        .expect(200);

      expect(response.body.safe).toBe(false);
      expect(response.body.violations).toHaveLength(1);
    });

    it('should reject missing code in validate', async () => {
      const response = await request(app)
        .post('/api/code/validate')
        .send({ language: 'python' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/code/health
  // ============================================================

  describe('GET /api/code/health', () => {
    it('should return healthy status', async () => {
      mockCheckHealth.mockResolvedValueOnce({
        available: true,
        provider: 'judge0',
        enabled: true,
      });

      const response = await request(app)
        .get('/api/code/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.available).toBe(true);
    });

    it('should return 503 when unavailable', async () => {
      mockCheckHealth.mockResolvedValueOnce({
        available: false,
        error: 'Docker not running',
      });

      const response = await request(app)
        .get('/api/code/health')
        .expect(503);

      expect(response.body.success).toBe(false);
    });
  });

  // ============================================================
  // GET /api/code/languages
  // ============================================================

  describe('GET /api/code/languages', () => {
    it('should list supported languages', async () => {
      const response = await request(app)
        .get('/api/code/languages')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.languages).toHaveLength(3);
      expect(response.body.languages.map((l: { id: string }) => l.id)).toEqual(
        expect.arrayContaining(['python', 'nodejs', 'bash']),
      );
      expect(response.body.enabled).toBe(true);
    });
  });
});
