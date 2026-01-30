/**
 * Unit Tests for CodeExecutionResult Component
 *
 * Tests code execution result display including:
 * - Rendering with different languages
 * - Success/error states
 * - Copy functionality
 * - Code collapse/expand
 * - Warnings display
 *
 * @module tests/components/CodeExecutionResult
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeExecutionResult } from '../CodeExecutionResult';

describe('CodeExecutionResult Component', () => {
  const mockClipboard = {
    writeText: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: mockClipboard });
  });

  describe('Basic rendering', () => {
    it('renders without crashing', () => {
      render(
        <CodeExecutionResult
          code="print('hello')"
          language="python"
          success={true}
        />
      );

      expect(screen.getByTestId('code-execution-result')).toBeInTheDocument();
    });

    it('displays the code content', () => {
      render(
        <CodeExecutionResult
          code="console.log('test')"
          language="nodejs"
          success={true}
        />
      );

      expect(screen.getByText("console.log('test')")).toBeInTheDocument();
    });

    it('displays the correct language name', () => {
      render(
        <CodeExecutionResult
          code="print('hello')"
          language="python"
          success={true}
        />
      );

      expect(screen.getByText('Python')).toBeInTheDocument();
    });

    it('displays Node.js for nodejs language', () => {
      render(
        <CodeExecutionResult
          code="console.log('test')"
          language="nodejs"
          success={true}
        />
      );

      expect(screen.getByText('Node.js')).toBeInTheDocument();
    });

    it('displays Bash for bash language', () => {
      render(
        <CodeExecutionResult
          code="echo hello"
          language="bash"
          success={true}
        />
      );

      expect(screen.getByText('Bash')).toBeInTheDocument();
    });
  });

  describe('Success/Error states', () => {
    it('shows success status for successful execution', () => {
      render(
        <CodeExecutionResult
          code="print('hello')"
          language="python"
          success={true}
          output="hello"
        />
      );

      expect(screen.getByText('✓ Erfolgreich')).toBeInTheDocument();
    });

    it('shows error status for failed execution', () => {
      render(
        <CodeExecutionResult
          code="print(undefined_var)"
          language="python"
          success={false}
          errors="NameError: undefined_var is not defined"
        />
      );

      expect(screen.getByText('✗ Fehler')).toBeInTheDocument();
    });

    it('displays output for successful execution', () => {
      render(
        <CodeExecutionResult
          code="print('hello world')"
          language="python"
          success={true}
          output="hello world"
        />
      );

      expect(screen.getByText('hello world')).toBeInTheDocument();
      expect(screen.getByText('Ausgabe')).toBeInTheDocument();
    });

    it('displays errors for failed execution', () => {
      render(
        <CodeExecutionResult
          code="invalid syntax"
          language="python"
          success={false}
          errors="SyntaxError: invalid syntax"
        />
      );

      expect(screen.getByText('SyntaxError: invalid syntax')).toBeInTheDocument();
      expect(screen.getByText('Fehler')).toBeInTheDocument();
    });

    it('shows no output message when output is empty', () => {
      render(
        <CodeExecutionResult
          code="x = 1"
          language="python"
          success={true}
        />
      );

      expect(screen.getByText('(keine Ausgabe)')).toBeInTheDocument();
    });
  });

  describe('Execution metadata', () => {
    it('displays execution time when provided', () => {
      render(
        <CodeExecutionResult
          code="print('test')"
          language="python"
          success={true}
          executionTimeMs={42}
        />
      );

      expect(screen.getByText('42ms')).toBeInTheDocument();
    });

    it('displays explanation when provided', () => {
      render(
        <CodeExecutionResult
          code="print('hello')"
          language="python"
          success={true}
          explanation="This code prints a greeting message"
        />
      );

      expect(screen.getByText('This code prints a greeting message')).toBeInTheDocument();
    });
  });

  describe('Warnings display', () => {
    it('displays warnings when provided', () => {
      render(
        <CodeExecutionResult
          code="import os"
          language="python"
          success={true}
          warnings={['System access detected', 'File operations detected']}
        />
      );

      expect(screen.getByText('Hinweise (2)')).toBeInTheDocument();
      expect(screen.getByText('System access detected')).toBeInTheDocument();
      expect(screen.getByText('File operations detected')).toBeInTheDocument();
    });

    it('does not show warnings section when no warnings', () => {
      render(
        <CodeExecutionResult
          code="print('safe')"
          language="python"
          success={true}
        />
      );

      expect(screen.queryByText(/Hinweise/)).not.toBeInTheDocument();
    });
  });

  describe('Copy functionality', () => {
    it('copies code to clipboard', async () => {
      const user = userEvent.setup();
      render(
        <CodeExecutionResult
          code="print('copy me')"
          language="python"
          success={true}
        />
      );

      const copyCodeButton = screen.getAllByRole('button', { name: /kopieren/i })[0];
      await user.click(copyCodeButton);

      expect(mockClipboard.writeText).toHaveBeenCalledWith("print('copy me')");
    });

    it('copies output to clipboard', async () => {
      const user = userEvent.setup();
      render(
        <CodeExecutionResult
          code="print('hello')"
          language="python"
          success={true}
          output="hello"
        />
      );

      const copyButtons = screen.getAllByRole('button', { name: /kopieren/i });
      const copyOutputButton = copyButtons[copyButtons.length - 1];
      await user.click(copyOutputButton);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('hello');
    });

    it('shows copied confirmation after copying', async () => {
      const user = userEvent.setup();
      render(
        <CodeExecutionResult
          code="print('test')"
          language="python"
          success={true}
        />
      );

      const copyButton = screen.getAllByRole('button', { name: /kopieren/i })[0];
      await user.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText('✓ Kopiert')).toBeInTheDocument();
      });
    });
  });

  describe('Code collapse/expand', () => {
    it('shows collapse button for long code', () => {
      const longCode = Array(20).fill("print('line')").join('\n');
      render(
        <CodeExecutionResult
          code={longCode}
          language="python"
          success={true}
        />
      );

      expect(screen.getByRole('button', { name: /einklappen/i })).toBeInTheDocument();
    });

    it('does not show collapse button for short code', () => {
      render(
        <CodeExecutionResult
          code="print('short')"
          language="python"
          success={true}
        />
      );

      expect(screen.queryByRole('button', { name: /einklappen|ausklappen/i })).not.toBeInTheDocument();
    });

    it('toggles between collapsed and expanded state', async () => {
      const user = userEvent.setup();
      const longCode = Array(20).fill("print('line')").join('\n');
      render(
        <CodeExecutionResult
          code={longCode}
          language="python"
          success={true}
        />
      );

      // Initially expanded
      const collapseBtn = screen.getByRole('button', { name: /einklappen/i });
      expect(collapseBtn).toHaveTextContent('▲ Einklappen');

      // Click to collapse
      await user.click(collapseBtn);
      expect(screen.getByRole('button', { name: /ausklappen/i })).toHaveTextContent('▼ Ausklappen');

      // Click to expand again
      await user.click(screen.getByRole('button', { name: /ausklappen/i }));
      expect(screen.getByRole('button', { name: /einklappen/i })).toHaveTextContent('▲ Einklappen');
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-labels on buttons', () => {
      render(
        <CodeExecutionResult
          code="print('test')"
          language="python"
          success={true}
          output="test"
        />
      );

      expect(screen.getByRole('button', { name: 'Code kopieren' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ausgabe kopieren' })).toBeInTheDocument();
    });

    it('has proper data-testid for testing', () => {
      render(
        <CodeExecutionResult
          code="test"
          language="python"
          success={true}
        />
      );

      expect(screen.getByTestId('code-execution-result')).toBeInTheDocument();
    });
  });
});
