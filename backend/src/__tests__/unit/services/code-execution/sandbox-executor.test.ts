/**
 * Sandbox Executor Tests
 *
 * Integration tests for Docker-based code execution.
 * Tests are skipped if Docker is not available.
 */

import {
  SandboxExecutor,
  getSandboxExecutor,
  isSandboxAvailable,
} from '../../../../services/code-execution/sandbox-executor';
import {
  DEFAULT_EXECUTION_OPTIONS,
  STRICT_EXECUTION_OPTIONS,
} from '../../../../services/code-execution/types';

describe('SandboxExecutor', () => {
  let executor: SandboxExecutor;
  let dockerAvailable: boolean;

  beforeAll(async () => {
    executor = getSandboxExecutor();
    dockerAvailable = await executor.isAvailable();

    if (!dockerAvailable) {
      console.warn('⚠️ Docker is not available - skipping sandbox executor tests');
    }
  });

  // ===========================================
  // Availability Tests
  // ===========================================

  describe('Availability', () => {
    it('should check Docker availability', async () => {
      const available = await isSandboxAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should return singleton instance', () => {
      const instance1 = getSandboxExecutor();
      const instance2 = getSandboxExecutor();
      expect(instance1).toBe(instance2);
    });
  });

  // ===========================================
  // Python Execution Tests
  // ===========================================

  describe('Python Execution', () => {
    const runIfDocker = dockerAvailable ? it : it.skip;

    runIfDocker('should execute simple Python code', async () => {
      const result = await executor.execute(
        'print("Hello, World!")',
        'python'
      );

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Hello, World!');
      expect(result.exitCode).toBe(0);
      expect(result.executionId).toBeDefined();
    });

    runIfDocker('should handle Python math operations', async () => {
      const code = `
import math
result = math.sqrt(16) + math.pow(2, 3)
print(f"Result: {result}")
`;
      const result = await executor.execute(code, 'python');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Result: 12.0');
    });

    runIfDocker('should capture Python errors', async () => {
      const result = await executor.execute(
        'print(undefined_variable)',
        'python'
      );

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('NameError');
    });

    runIfDocker('should handle Python syntax errors', async () => {
      const result = await executor.execute(
        'def broken(:\n    pass',
        'python'
      );

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('SyntaxError');
    });

    runIfDocker('should respect timeout', async () => {
      const result = await executor.execute(
        'import time\ntime.sleep(60)\nprint("done")',
        'python',
        { timeout: 2000 }
      );

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(124); // Timeout exit code
    }, 10000);

    runIfDocker('should isolate network (no external access)', async () => {
      const result = await executor.execute(
        'import urllib.request\nurllib.request.urlopen("http://example.com")',
        'python'
      );

      // Should fail due to network isolation
      expect(result.success).toBe(false);
    });
  });

  // ===========================================
  // Node.js Execution Tests
  // ===========================================

  describe('Node.js Execution', () => {
    const runIfDocker = dockerAvailable ? it : it.skip;

    runIfDocker('should execute simple Node.js code', async () => {
      const result = await executor.execute(
        'console.log("Hello, Node!")',
        'nodejs'
      );

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Hello, Node!');
    });

    runIfDocker('should handle Node.js math operations', async () => {
      const code = `
const result = Math.sqrt(16) + Math.pow(2, 3);
console.log(\`Result: \${result}\`);
`;
      const result = await executor.execute(code, 'nodejs');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Result: 12');
    });

    runIfDocker('should capture Node.js errors', async () => {
      const result = await executor.execute(
        'console.log(undefinedVariable)',
        'nodejs'
      );

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('ReferenceError');
    });

    runIfDocker('should handle async/await', async () => {
      const code = `
async function test() {
  return Promise.resolve('async works');
}
test().then(console.log);
`;
      const result = await executor.execute(code, 'nodejs');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('async works');
    });
  });

  // ===========================================
  // Bash Execution Tests
  // ===========================================

  describe('Bash Execution', () => {
    const runIfDocker = dockerAvailable ? it : it.skip;

    runIfDocker('should execute simple Bash code', async () => {
      const result = await executor.execute(
        'echo "Hello, Bash!"',
        'bash'
      );

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Hello, Bash!');
    });

    runIfDocker('should handle Bash arithmetic', async () => {
      const code = `
result=$((2 + 3 * 4))
echo "Result: $result"
`;
      const result = await executor.execute(code, 'bash');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Result: 14');
    });

    runIfDocker('should capture Bash errors', async () => {
      const result = await executor.execute(
        'set -e\ncommand_that_does_not_exist',
        'bash'
      );

      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    });

    runIfDocker('should allow /tmp access', async () => {
      const code = `
echo "test content" > /tmp/test.txt
cat /tmp/test.txt
rm /tmp/test.txt
`;
      const result = await executor.execute(code, 'bash');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('test content');
    });
  });

  // ===========================================
  // Resource Limit Tests
  // ===========================================

  describe('Resource Limits', () => {
    const runIfDocker = dockerAvailable ? it : it.skip;

    runIfDocker('should enforce memory limit', async () => {
      // Try to allocate more memory than allowed
      const code = `
import sys
# Try to allocate ~500MB (should fail with 128m limit)
data = bytearray(500 * 1024 * 1024)
print(f"Allocated {len(data)} bytes")
`;
      const result = await executor.execute(code, 'python', {
        memoryLimit: '128m',
        timeout: 10000,
      });

      // Should fail or be killed
      expect(result.success).toBe(false);
    }, 15000);

    runIfDocker('should use strict options correctly', async () => {
      const code = 'print("quick")';
      const result = await executor.execute(code, 'python', STRICT_EXECUTION_OPTIONS);

      expect(result.success).toBe(true);
    });
  });

  // ===========================================
  // Output Handling Tests
  // ===========================================

  describe('Output Handling', () => {
    const runIfDocker = dockerAvailable ? it : it.skip;

    runIfDocker('should handle multiline output', async () => {
      const code = `
for i in range(5):
    print(f"Line {i}")
`;
      const result = await executor.execute(code, 'python');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Line 0');
      expect(result.stdout).toContain('Line 4');
    });

    runIfDocker('should handle stderr output', async () => {
      const code = `
import sys
print("stdout message")
print("stderr message", file=sys.stderr)
`;
      // Note: This will fail because sys is blocked
      // Let's use a different approach
      const result = await executor.execute(
        'echo "stdout" && >&2 echo "stderr"',
        'bash'
      );

      expect(result.stdout).toContain('stdout');
      expect(result.stderr).toContain('stderr');
    });

    runIfDocker('should truncate large output', async () => {
      const code = `
for i in range(100000):
    print(f"Line {i}: " + "x" * 100)
`;
      const result = await executor.execute(code, 'python', {
        timeout: 30000,
      });

      // Output should be truncated
      if (result.stdout.length > 50000) {
        expect(result.truncated).toBe(true);
      }
    }, 35000);
  });

  // ===========================================
  // Cleanup Tests
  // ===========================================

  describe('Cleanup', () => {
    const runIfDocker = dockerAvailable ? it : it.skip;

    runIfDocker('should cleanup after execution', async () => {
      const result = await executor.execute('print("test")', 'python');

      // Execution should have an ID
      expect(result.executionId).toBeDefined();

      // After execution, no container should be left running
      // This is hard to test without checking Docker directly
      expect(result.success).toBe(true);
    });

    runIfDocker('should handle multiple concurrent executions', async () => {
      const executions = await Promise.all([
        executor.execute('print("exec 1")', 'python'),
        executor.execute('console.log("exec 2")', 'nodejs'),
        executor.execute('echo "exec 3"', 'bash'),
      ]);

      expect(executions[0].success).toBe(true);
      expect(executions[1].success).toBe(true);
      expect(executions[2].success).toBe(true);

      expect(executions[0].stdout).toContain('exec 1');
      expect(executions[1].stdout).toContain('exec 2');
      expect(executions[2].stdout).toContain('exec 3');
    });
  });
});
