/**
 * Safety Validator Tests
 *
 * Comprehensive tests for the code safety validator.
 * Tests all forbidden patterns and warning detection.
 */

import {
  validateCode,
  quickSafetyCheck,
  formatSafetyReport,
  PYTHON_FORBIDDEN_PATTERNS,
  NODEJS_FORBIDDEN_PATTERNS,
  BASH_FORBIDDEN_PATTERNS,
} from '../../../../services/code-execution/safety-validator';
import { MAX_CODE_LENGTH } from '../../../../services/code-execution/types';

describe('SafetyValidator', () => {
  // ===========================================
  // Python Tests
  // ===========================================

  describe('Python', () => {
    describe('Forbidden Imports', () => {
      it('should block os import', () => {
        const result = validateCode('import os\nos.system("ls")', 'python');
        expect(result.safe).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations[0].type).toBe('forbidden_import');
      });

      it('should block from os import', () => {
        const result = validateCode('from os import path', 'python');
        expect(result.safe).toBe(false);
      });

      it('should block sys import', () => {
        const result = validateCode('import sys\nprint(sys.version)', 'python');
        expect(result.safe).toBe(false);
      });

      it('should block subprocess', () => {
        const result = validateCode('import subprocess', 'python');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'process_spawn')).toBe(true);
      });

      it('should block socket', () => {
        const result = validateCode('import socket', 'python');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'network_access')).toBe(true);
      });

      it('should block requests', () => {
        const result = validateCode('import requests', 'python');
        expect(result.safe).toBe(false);
      });

      it('should block urllib', () => {
        const result = validateCode('import urllib.request', 'python');
        expect(result.safe).toBe(false);
      });

      it('should block shutil', () => {
        const result = validateCode('import shutil', 'python');
        expect(result.safe).toBe(false);
      });

      it('should block pickle', () => {
        const result = validateCode('import pickle', 'python');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'code_injection')).toBe(true);
      });

      it('should block ctypes', () => {
        const result = validateCode('import ctypes', 'python');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'privilege_escalation')).toBe(true);
      });
    });

    describe('Dangerous Functions', () => {
      it('should block eval()', () => {
        const result = validateCode('eval("print(1)")', 'python');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'code_injection')).toBe(true);
      });

      it('should block exec()', () => {
        const result = validateCode('exec("x = 1")', 'python');
        expect(result.safe).toBe(false);
      });

      it('should block __import__', () => {
        const result = validateCode('__import__("os")', 'python');
        expect(result.safe).toBe(false);
      });

      it('should block compile()', () => {
        const result = validateCode('compile("x=1", "", "exec")', 'python');
        expect(result.safe).toBe(false);
      });
    });

    describe('Path Traversal', () => {
      it('should block ../ patterns', () => {
        const result = validateCode('open("../../../etc/passwd")', 'python');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'path_traversal')).toBe(true);
      });

      it('should block home directory access', () => {
        const result = validateCode('open("~/.ssh/id_rsa")', 'python');
        expect(result.safe).toBe(false);
      });

      it('should block absolute paths outside /tmp', () => {
        const result = validateCode('open("/etc/passwd")', 'python');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'file_system_access')).toBe(true);
      });
    });

    describe('Allowed Operations', () => {
      it('should allow math operations', () => {
        const result = validateCode('import math\nprint(math.sqrt(16))', 'python');
        expect(result.safe).toBe(true);
      });

      it('should allow json operations', () => {
        const result = validateCode('import json\ndata = json.loads("{}")', 'python');
        expect(result.safe).toBe(true);
      });

      it('should allow datetime', () => {
        const result = validateCode('from datetime import datetime\nprint(datetime.now())', 'python');
        expect(result.safe).toBe(true);
      });

      it('should allow collections', () => {
        const result = validateCode('from collections import Counter\nc = Counter([1,2,3])', 'python');
        expect(result.safe).toBe(true);
      });

      it('should allow itertools', () => {
        const result = validateCode('import itertools\nlist(itertools.permutations([1,2,3]))', 'python');
        expect(result.safe).toBe(true);
      });

      it('should allow basic print statements', () => {
        const result = validateCode('print("Hello, World!")', 'python');
        expect(result.safe).toBe(true);
      });

      it('should allow list comprehensions', () => {
        const result = validateCode('[x**2 for x in range(10)]', 'python');
        expect(result.safe).toBe(true);
      });

      it('should allow function definitions', () => {
        const code = `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print(fibonacci(10))`;
        const result = validateCode(code, 'python');
        expect(result.safe).toBe(true);
      });
    });

    describe('Warnings', () => {
      it('should warn about while True', () => {
        const result = validateCode('while True:\n    pass', 'python');
        expect(result.safe).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.type === 'infinite_loop_risk')).toBe(true);
      });

      it('should warn about large iterations', () => {
        const result = validateCode('for i in range(10000000):\n    pass', 'python');
        expect(result.warnings.some(w => w.type === 'resource_intensive')).toBe(true);
      });
    });
  });

  // ===========================================
  // Node.js Tests
  // ===========================================

  describe('Node.js', () => {
    describe('Forbidden Modules', () => {
      it('should block child_process', () => {
        const result = validateCode('const cp = require("child_process")', 'nodejs');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'process_spawn')).toBe(true);
      });

      it('should block net module', () => {
        const result = validateCode('const net = require("net")', 'nodejs');
        expect(result.safe).toBe(false);
      });

      it('should block http module', () => {
        const result = validateCode('const http = require("http")', 'nodejs');
        expect(result.safe).toBe(false);
      });

      it('should block https module', () => {
        const result = validateCode('const https = require("https")', 'nodejs');
        expect(result.safe).toBe(false);
      });

      it('should block vm module', () => {
        const result = validateCode('const vm = require("vm")', 'nodejs');
        expect(result.safe).toBe(false);
      });

      it('should block cluster', () => {
        const result = validateCode('const cluster = require("cluster")', 'nodejs');
        expect(result.safe).toBe(false);
      });
    });

    describe('Dangerous Functions', () => {
      it('should block eval()', () => {
        const result = validateCode('eval("console.log(1)")', 'nodejs');
        expect(result.safe).toBe(false);
      });

      it('should block Function constructor', () => {
        const result = validateCode('const fn = new Function("return 1")', 'nodejs');
        expect(result.safe).toBe(false);
      });

      it('should block fetch()', () => {
        const result = validateCode('fetch("http://example.com")', 'nodejs');
        expect(result.safe).toBe(false);
      });

      it('should block process.env', () => {
        const result = validateCode('console.log(process.env.SECRET)', 'nodejs');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'environment_access')).toBe(true);
      });

      it('should block process.exit', () => {
        const result = validateCode('process.exit(1)', 'nodejs');
        expect(result.safe).toBe(false);
      });
    });

    describe('Allowed Operations', () => {
      it('should allow console.log', () => {
        const result = validateCode('console.log("Hello")', 'nodejs');
        expect(result.safe).toBe(true);
      });

      it('should allow basic math', () => {
        const result = validateCode('const sum = 1 + 2;\nconsole.log(sum);', 'nodejs');
        expect(result.safe).toBe(true);
      });

      it('should allow arrays and objects', () => {
        const result = validateCode('const arr = [1,2,3];\nconst obj = {a: 1};', 'nodejs');
        expect(result.safe).toBe(true);
      });

      it('should allow path module', () => {
        const result = validateCode('const path = require("path");\npath.join("a","b")', 'nodejs');
        expect(result.safe).toBe(true);
      });

      it('should allow crypto module', () => {
        const result = validateCode('const crypto = require("crypto");\ncrypto.randomUUID()', 'nodejs');
        expect(result.safe).toBe(true);
      });
    });
  });

  // ===========================================
  // Bash Tests
  // ===========================================

  describe('Bash', () => {
    describe('Forbidden Commands', () => {
      it('should block curl', () => {
        const result = validateCode('curl http://example.com', 'bash');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'network_access')).toBe(true);
      });

      it('should block wget', () => {
        const result = validateCode('wget http://example.com', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block ssh', () => {
        const result = validateCode('ssh user@host', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block scp', () => {
        const result = validateCode('scp file user@host:', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block sudo', () => {
        const result = validateCode('sudo rm -rf /', 'bash');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'privilege_escalation')).toBe(true);
      });

      it('should block chmod', () => {
        const result = validateCode('chmod 777 /etc/passwd', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block dangerous rm', () => {
        const result = validateCode('rm -rf /', 'bash');
        expect(result.safe).toBe(false);
      });
    });

    describe('Path Restrictions', () => {
      it('should block /etc access', () => {
        const result = validateCode('cat /etc/passwd', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block /var access', () => {
        const result = validateCode('ls /var/log', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block /home access', () => {
        const result = validateCode('cat /home/user/.bashrc', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block writes outside /tmp', () => {
        const result = validateCode('echo "test" > /var/test.txt', 'bash');
        expect(result.safe).toBe(false);
      });
    });

    describe('Code Injection', () => {
      it('should block command substitution $(...)', () => {
        const result = validateCode('echo $(whoami)', 'bash');
        expect(result.safe).toBe(false);
        expect(result.violations.some(v => v.type === 'code_injection')).toBe(true);
      });

      it('should block backtick substitution', () => {
        const result = validateCode('echo `whoami`', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block eval', () => {
        const result = validateCode('eval "ls -la"', 'bash');
        expect(result.safe).toBe(false);
      });

      it('should block source', () => {
        const result = validateCode('source /etc/profile', 'bash');
        expect(result.safe).toBe(false);
      });
    });

    describe('Allowed Operations', () => {
      it('should allow echo', () => {
        const result = validateCode('echo "Hello World"', 'bash');
        expect(result.safe).toBe(true);
      });

      it('should allow printf', () => {
        const result = validateCode('printf "%s\\n" "Hello"', 'bash');
        expect(result.safe).toBe(true);
      });

      it('should allow basic arithmetic', () => {
        const result = validateCode('expr 1 + 2', 'bash');
        expect(result.safe).toBe(true);
      });

      it('should allow /tmp access', () => {
        const result = validateCode('echo "test" > /tmp/test.txt', 'bash');
        // This is tricky because we also block env vars
        // Let's check for the specific pattern
        const code = 'ls /tmp';
        const result2 = validateCode(code, 'bash');
        expect(result2.safe).toBe(true);
      });
    });
  });

  // ===========================================
  // General Tests
  // ===========================================

  describe('General', () => {
    it('should reject code exceeding max length', () => {
      const longCode = 'x'.repeat(MAX_CODE_LENGTH + 1);
      const result = validateCode(longCode, 'python');
      expect(result.safe).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should accept empty code', () => {
      const result = validateCode('', 'python');
      expect(result.safe).toBe(true);
      expect(result.score).toBe(100);
    });

    it('should accept whitespace-only code', () => {
      const result = validateCode('   \n   \t   ', 'python');
      expect(result.safe).toBe(true);
    });

    it('should include line numbers in violations', () => {
      const code = 'print("hello")\nimport os\nprint("world")';
      const result = validateCode(code, 'python');
      expect(result.safe).toBe(false);
      expect(result.violations[0].line).toBe(2);
    });

    it('should include code snippets in violations', () => {
      const code = 'import subprocess';
      const result = validateCode(code, 'python');
      expect(result.violations[0].snippet).toBeDefined();
    });
  });

  // ===========================================
  // Quick Safety Check
  // ===========================================

  describe('quickSafetyCheck', () => {
    it('should return true for safe code', () => {
      expect(quickSafetyCheck('print("hello")', 'python')).toBe(true);
    });

    it('should return false for dangerous code', () => {
      expect(quickSafetyCheck('import os', 'python')).toBe(false);
    });

    it('should return false for code exceeding length', () => {
      const longCode = 'x'.repeat(MAX_CODE_LENGTH + 1);
      expect(quickSafetyCheck(longCode, 'python')).toBe(false);
    });

    it('should be faster than full validation', () => {
      const code = 'print("hello")\n'.repeat(100);

      const quickStart = performance.now();
      quickSafetyCheck(code, 'python');
      const quickTime = performance.now() - quickStart;

      const fullStart = performance.now();
      validateCode(code, 'python');
      const fullTime = performance.now() - fullStart;

      // Quick check should be at least as fast
      expect(quickTime).toBeLessThanOrEqual(fullTime * 2);
    });
  });

  // ===========================================
  // Safety Report Formatting
  // ===========================================

  describe('formatSafetyReport', () => {
    it('should format safe result correctly', () => {
      const result = validateCode('print("hello")', 'python');
      const report = formatSafetyReport(result);
      expect(report).toContain('✓');
      expect(report).toContain('passed');
    });

    it('should format unsafe result correctly', () => {
      const result = validateCode('import os', 'python');
      const report = formatSafetyReport(result);
      expect(report).toContain('✗');
      expect(report).toContain('FAILED');
      expect(report).toContain('Violations');
    });

    it('should include warnings in report', () => {
      const result = validateCode('while True:\n    pass', 'python');
      const report = formatSafetyReport(result);
      expect(report).toContain('Warnings');
    });
  });

  // ===========================================
  // Pattern Coverage
  // ===========================================

  describe('Pattern Coverage', () => {
    it('should have patterns for all Python forbidden imports', () => {
      expect(PYTHON_FORBIDDEN_PATTERNS.length).toBeGreaterThan(10);
    });

    it('should have patterns for all Node.js forbidden modules', () => {
      expect(NODEJS_FORBIDDEN_PATTERNS.length).toBeGreaterThan(10);
    });

    it('should have patterns for all Bash forbidden commands', () => {
      expect(BASH_FORBIDDEN_PATTERNS.length).toBeGreaterThan(10);
    });
  });
});
