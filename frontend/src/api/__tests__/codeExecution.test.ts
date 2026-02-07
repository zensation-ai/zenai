/**
 * Code Execution API Tests
 *
 * Tests for frontend/src/api/codeExecution.ts
 * Covers all API functions and utility functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  executeCode,
  runCode,
  validateCode,
  checkCodeHealth,
  getLanguages,
  isSupportedLanguage,
  getLanguageDisplayName,
  detectLanguage,
} from '../codeExecution';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('Code Execution API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeCode', () => {
    it('should send execute request and return result data', async () => {
      const mockResult = {
        success: true,
        code: 'print("Hello")',
        language: 'python' as const,
        explanation: 'Prints Hello',
        output: 'Hello\n',
        exitCode: 0,
        executionTimeMs: 150,
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockResult },
      });

      const result = await executeCode({
        task: 'Print Hello',
        language: 'python',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/code/execute', {
        task: 'Print Hello',
        language: 'python',
      });
      expect(result).toEqual(mockResult);
      expect(result.output).toBe('Hello\n');
    });

    it('should forward optional context and inputData', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: { success: true } },
      });

      await executeCode({
        task: 'Process data',
        language: 'python',
        context: 'Data analysis task',
        inputData: '1,2,3,4,5',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/code/execute', {
        task: 'Process data',
        language: 'python',
        context: 'Data analysis task',
        inputData: '1,2,3,4,5',
      });
    });

    it('should propagate API errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network Error'));

      await expect(executeCode({ task: 'test', language: 'python' })).rejects.toThrow('Network Error');
    });
  });

  describe('runCode', () => {
    it('should send code directly for execution', async () => {
      const mockResult = {
        success: true,
        output: '42\n',
        exitCode: 0,
        executionTimeMs: 50,
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockResult },
      });

      const result = await runCode({
        code: 'console.log(42)',
        language: 'nodejs',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/code/run', {
        code: 'console.log(42)',
        language: 'nodejs',
      });
      expect(result.output).toBe('42\n');
    });

    it('should handle execution errors in result', async () => {
      const mockResult = {
        success: false,
        errors: 'SyntaxError: Unexpected token',
        exitCode: 1,
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockResult },
      });

      const result = await runCode({
        code: 'invalid code {{{',
        language: 'nodejs',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('SyntaxError');
    });
  });

  describe('validateCode', () => {
    it('should validate safe code', async () => {
      const mockResult = {
        safe: true,
        score: 95,
        violations: [],
        warnings: [],
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockResult },
      });

      const result = await validateCode({
        code: 'print("Hello")',
        language: 'python',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/api/code/validate', {
        code: 'print("Hello")',
        language: 'python',
      });
      expect(result.safe).toBe(true);
      expect(result.score).toBe(95);
      expect(result.violations).toHaveLength(0);
    });

    it('should return violations for unsafe code', async () => {
      const mockResult = {
        safe: false,
        score: 20,
        violations: [
          { type: 'dangerous_import', message: 'os.system is not allowed', line: 1 },
        ],
        warnings: [
          { type: 'resource_usage', message: 'Consider adding timeout', suggestion: 'Use signal.alarm()' },
        ],
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockResult },
      });

      const result = await validateCode({
        code: 'import os; os.system("rm -rf /")',
        language: 'python',
      });

      expect(result.safe).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].type).toBe('dangerous_import');
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe('checkCodeHealth', () => {
    it('should return health status when service is available', async () => {
      const mockHealth = {
        available: true,
        enabled: true,
        dockerRunning: true,
      };

      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockHealth },
      });

      const result = await checkCodeHealth();

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/code/health');
      expect(result.available).toBe(true);
      expect(result.enabled).toBe(true);
    });

    it('should return unavailable status when service is down', async () => {
      const mockHealth = {
        available: false,
        enabled: true,
        dockerRunning: false,
        error: 'Docker daemon not running',
      };

      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockHealth },
      });

      const result = await checkCodeHealth();

      expect(result.available).toBe(false);
      expect(result.error).toBe('Docker daemon not running');
    });
  });

  describe('getLanguages', () => {
    it('should return list of supported languages', async () => {
      const mockData = {
        languages: [
          { id: 'python', name: 'Python', extension: '.py', availablePackages: ['numpy', 'pandas'] },
          { id: 'nodejs', name: 'Node.js', extension: '.js', availablePackages: ['lodash'] },
          { id: 'bash', name: 'Bash', extension: '.sh', availablePackages: [] },
        ],
        enabled: true,
      };

      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockData },
      });

      const result = await getLanguages();

      expect(mockedAxios.get).toHaveBeenCalledWith('/api/code/languages');
      expect(result.languages).toHaveLength(3);
      expect(result.enabled).toBe(true);
      expect(result.languages[0].id).toBe('python');
    });
  });

  describe('isSupportedLanguage', () => {
    it('should return true for python', () => {
      expect(isSupportedLanguage('python')).toBe(true);
    });

    it('should return true for nodejs', () => {
      expect(isSupportedLanguage('nodejs')).toBe(true);
    });

    it('should return true for bash', () => {
      expect(isSupportedLanguage('bash')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(isSupportedLanguage('ruby')).toBe(false);
      expect(isSupportedLanguage('java')).toBe(false);
      expect(isSupportedLanguage('go')).toBe(false);
      expect(isSupportedLanguage('')).toBe(false);
    });
  });

  describe('getLanguageDisplayName', () => {
    it('should return Python for python', () => {
      expect(getLanguageDisplayName('python')).toBe('Python');
    });

    it('should return Node.js for nodejs', () => {
      expect(getLanguageDisplayName('nodejs')).toBe('Node.js');
    });

    it('should return Bash for bash', () => {
      expect(getLanguageDisplayName('bash')).toBe('Bash');
    });
  });

  describe('detectLanguage', () => {
    it('should detect Python from def keyword', () => {
      expect(detectLanguage('def hello():\n  print("hi")')).toBe('python');
    });

    it('should detect Python from import statement', () => {
      expect(detectLanguage('import numpy as np')).toBe('python');
    });

    it('should detect Python from print function', () => {
      expect(detectLanguage('print("hello world")')).toBe('python');
    });

    it('should detect Node.js from const keyword', () => {
      expect(detectLanguage('const x = 42;')).toBe('nodejs');
    });

    it('should detect Node.js from require', () => {
      expect(detectLanguage('const fs = require("fs");')).toBe('nodejs');
    });

    it('should detect Node.js from console.log', () => {
      expect(detectLanguage('console.log("hello");')).toBe('nodejs');
    });

    it('should detect Node.js from module.exports', () => {
      expect(detectLanguage('module.exports = { foo: 1 };')).toBe('nodejs');
    });

    it('should detect Bash from shebang', () => {
      expect(detectLanguage('#!/bin/bash\necho "hello"')).toBe('bash');
    });

    it('should detect Bash from echo', () => {
      expect(detectLanguage('echo "Hello World"')).toBe('bash');
    });

    it('should return null for unrecognizable code', () => {
      expect(detectLanguage('42')).toBeNull();
      expect(detectLanguage('')).toBeNull();
    });
  });
});
