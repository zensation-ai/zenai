/**
 * Unit Tests for ArtifactPanel Component
 *
 * Tests artifact panel functionality including:
 * - Rendering different artifact types
 * - Navigation between artifacts
 * - Copy and download functionality
 * - Fullscreen mode
 * - Keyboard shortcuts
 *
 * @module tests/components/ArtifactPanel
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtifactPanel, ArtifactButton } from '../ArtifactPanel';
import type { Artifact } from '../../types/artifacts';

// Mock syntax highlighter utility
vi.mock('../../utils/syntaxHighlighter', () => ({
  SyntaxHighlighter: ({ children }: { children: string }) => <pre data-testid="syntax-highlighter">{children}</pre>,
  oneDark: {},
}));

// Mock createPortal to render in the same container
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock Toast
vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

describe('ArtifactPanel Component', () => {
  const mockWriteText = vi.fn().mockResolvedValue(undefined);

  const mockArtifact: Artifact = {
    id: 'test-artifact-1',
    title: 'Test Code',
    type: 'code',
    language: 'python',
    content: 'print("Hello, World!")',
    description: 'A simple test script',
  };

  const mockOnClose = vi.fn();
  const mockOnPrevious = vi.fn();
  const mockOnNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders without crashing', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays the artifact title', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Test Code')).toBeInTheDocument();
    });

    it('displays the language badge for code artifacts', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('python')).toBeInTheDocument();
    });

    it('displays the description when provided', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('A simple test script')).toBeInTheDocument();
    });

    it('displays the code content', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('print("Hello, World!")')).toBeInTheDocument();
    });
  });

  describe('Different artifact types', () => {
    it('renders markdown artifacts', () => {
      const mdArtifact: Artifact = {
        id: 'md-1',
        title: 'README',
        type: 'markdown',
        content: '# Hello World\n\nThis is markdown.',
      };

      render(
        <ArtifactPanel
          artifact={mdArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('README')).toBeInTheDocument();
    });

    it('renders CSV artifacts as table', () => {
      const csvArtifact: Artifact = {
        id: 'csv-1',
        title: 'Data',
        type: 'csv',
        content: 'Name,Age\nAlice,30\nBob,25',
      };

      render(
        <ArtifactPanel
          artifact={csvArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Age')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
    });

    it('renders mermaid artifacts with note', () => {
      const mermaidArtifact: Artifact = {
        id: 'mermaid-1',
        title: 'Flowchart',
        type: 'mermaid',
        content: 'graph TD\n  A --> B',
      };

      render(
        <ArtifactPanel
          artifact={mermaidArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/Mermaid-Diagramm/)).toBeInTheDocument();
      expect(screen.getByText(/Mermaid Editor/)).toBeInTheDocument();
    });
  });

  describe('Close functionality', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getByRole('button', { name: /schließen/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking overlay', async () => {
      const user = userEvent.setup();
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      const overlay = screen.getByRole('presentation');
      await user.click(overlay);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not close when clicking panel content', async () => {
      const user = userEvent.setup();
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      await user.click(dialog);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    it('shows navigation buttons when hasPrevious and hasNext are true', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          hasPrevious={true}
          hasNext={true}
        />
      );

      expect(screen.getByRole('button', { name: /vorheriges/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /nächstes/i })).toBeInTheDocument();
    });

    it('disables previous button when hasPrevious is false', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          hasPrevious={false}
          hasNext={true}
        />
      );

      expect(screen.getByRole('button', { name: /vorheriges/i })).toBeDisabled();
    });

    it('disables next button when hasNext is false', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          hasPrevious={true}
          hasNext={false}
        />
      );

      expect(screen.getByRole('button', { name: /nächstes/i })).toBeDisabled();
    });

    it('calls onPrevious when previous button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          hasPrevious={true}
          hasNext={true}
        />
      );

      await user.click(screen.getByRole('button', { name: /vorheriges/i }));
      expect(mockOnPrevious).toHaveBeenCalledTimes(1);
    });

    it('calls onNext when next button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          hasPrevious={true}
          hasNext={true}
        />
      );

      await user.click(screen.getByRole('button', { name: /nächstes/i }));
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });

    it('hides navigation when no onPrevious/onNext handlers', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByRole('button', { name: /vorheriges/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /nächstes/i })).not.toBeInTheDocument();
    });
  });

  describe('Copy functionality', () => {
    it('has copy button available', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      const copyButton = screen.getByRole('button', { name: /zwischenablage/i });
      expect(copyButton).toBeInTheDocument();
    });

    it('copy button is clickable', async () => {
      const user = userEvent.setup();
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      const copyButton = screen.getByRole('button', { name: /zwischenablage/i });
      // Should not throw when clicked
      await user.click(copyButton);
    });
  });

  describe('Fullscreen mode', () => {
    it('toggles fullscreen mode', async () => {
      const user = userEvent.setup();
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      const fullscreenButton = screen.getByRole('button', { name: /vollbild/i });
      await user.click(fullscreenButton);

      // After clicking, the button label should change
      expect(screen.getByRole('button', { name: /beenden/i })).toBeInTheDocument();
    });
  });

  describe('Keyboard shortcuts', () => {
    it('closes panel on Escape key', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('navigates to previous on ArrowLeft key', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
          onPrevious={mockOnPrevious}
          hasPrevious={true}
        />
      );

      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(mockOnPrevious).toHaveBeenCalledTimes(1);
    });

    it('navigates to next on ArrowRight key', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
          onNext={mockOnNext}
          hasNext={true}
        />
      );

      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });

    it('does not navigate when no previous exists', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
          onPrevious={mockOnPrevious}
          hasPrevious={false}
        />
      );

      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(mockOnPrevious).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes on dialog', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'artifact-panel-title');
    });

    it('has proper ARIA labels on action buttons', () => {
      render(
        <ArtifactPanel
          artifact={mockArtifact}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('button', { name: /zwischenablage/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /herunterladen/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /vollbild/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /schließen/i })).toBeInTheDocument();
    });
  });
});

describe('ArtifactButton Component', () => {
  const mockArtifact: Artifact = {
    id: 'btn-artifact-1',
    title: 'Button Test',
    type: 'code',
    language: 'javascript',
    content: 'const x = 1;',
  };

  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(
      <ArtifactButton
        artifact={mockArtifact}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('displays the artifact title', () => {
    render(
      <ArtifactButton
        artifact={mockArtifact}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('Button Test')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    render(
      <ArtifactButton
        artifact={mockArtifact}
        onClick={mockOnClick}
      />
    );

    await user.click(screen.getByRole('button'));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('has proper aria-label', () => {
    render(
      <ArtifactButton
        artifact={mockArtifact}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'code öffnen: Button Test'
    );
  });

  it('shows correct icon for different artifact types', () => {
    const markdownArtifact: Artifact = {
      ...mockArtifact,
      type: 'markdown',
    };

    render(
      <ArtifactButton
        artifact={markdownArtifact}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'markdown öffnen: Button Test'
    );
  });
});
