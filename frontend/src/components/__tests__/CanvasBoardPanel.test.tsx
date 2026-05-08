/**
 * Unit Tests for Canvas Board Components
 *
 * Tests CanvasBoardPanel (ReactFlow board mode) and custom node types:
 * - IdeaNode: context-colored idea cards
 * - NoteNode: inline-editable text
 * - ImageNode: image display with caption
 *
 * Chunk 5 — V1 Polish Sprint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ============================================================
// Mock ReactFlow (heavy DOM dependency)
// ============================================================

vi.mock('reactflow', () => {
  const Handle = ({ type, position }: any) => (
    <div data-testid={`handle-${type}-${position}`} />
  );
  return {
    default: ({ children, nodes, edges, onDoubleClick, nodeTypes }: any) => (
      <div data-testid="react-flow" data-nodes={nodes?.length} data-edges={edges?.length}>
        {children}
        <button data-testid="pane-dblclick" onClick={(e) => onDoubleClick?.(e)} />
      </div>
    ),
    Background: () => <div data-testid="rf-background" />,
    Controls: () => <div data-testid="rf-controls" />,
    MiniMap: () => <div data-testid="rf-minimap" />,
    Handle,
    Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
    BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
    addEdge: vi.fn((conn: any, edges: any[]) => [...edges, { id: 'new-edge', ...conn }]),
    useNodesState: (init: any[]) => {
      let nodes = [...init];
      const setNodes = vi.fn((updater: any) => {
        nodes = typeof updater === 'function' ? updater(nodes) : updater;
        return nodes;
      });
      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState: (init: any[]) => {
      let edges = [...init];
      const setEdges = vi.fn((updater: any) => {
        edges = typeof updater === 'function' ? updater(edges) : updater;
        return edges;
      });
      return [edges, setEdges, vi.fn()];
    },
  };
});

vi.mock('reactflow/dist/style.css', () => ({}));

// ============================================================
// CanvasBoardPanel Tests
// ============================================================

import { CanvasBoardPanel, type BoardData } from '../canvas/CanvasBoardPanel';

describe('CanvasBoardPanel', () => {
  const emptyBoard: BoardData = { nodes: [], edges: [] };
  const mockOnBoardChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ReactFlow with background, controls, and minimap', () => {
    render(<CanvasBoardPanel boardData={emptyBoard} onBoardChange={mockOnBoardChange} />);

    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    expect(screen.getByTestId('rf-background')).toBeInTheDocument();
    expect(screen.getByTestId('rf-controls')).toBeInTheDocument();
    expect(screen.getByTestId('rf-minimap')).toBeInTheDocument();
  });

  it('renders with empty board data', () => {
    render(<CanvasBoardPanel boardData={emptyBoard} onBoardChange={mockOnBoardChange} />);

    const flow = screen.getByTestId('react-flow');
    expect(flow.getAttribute('data-nodes')).toBe('0');
    expect(flow.getAttribute('data-edges')).toBe('0');
  });

  it('renders with populated board data', () => {
    const boardData: BoardData = {
      nodes: [
        { id: 'n1', type: 'note', position: { x: 0, y: 0 }, data: { text: 'Hello' } },
        { id: 'n2', type: 'idea', position: { x: 200, y: 0 }, data: { title: 'Test', content: 'Content' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
      ],
    };

    render(<CanvasBoardPanel boardData={boardData} onBoardChange={mockOnBoardChange} />);

    const flow = screen.getByTestId('react-flow');
    expect(flow.getAttribute('data-nodes')).toBe('2');
    expect(flow.getAttribute('data-edges')).toBe('1');
  });

  it('has keyboard event handler on wrapper div', () => {
    const { container } = render(
      <CanvasBoardPanel boardData={emptyBoard} onBoardChange={mockOnBoardChange} />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('tabindex')).toBe('0');
  });
});

// ============================================================
// IdeaNode Tests
// ============================================================

import { IdeaNode } from '../canvas/nodes/IdeaNode';

describe('IdeaNode', () => {
  const baseProps: any = {
    id: 'idea-1',
    type: 'idea',
    selected: false,
    zIndex: 0,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    dragging: false,
    data: {
      title: 'Test Idea',
      content: 'Some content here',
      context: 'operations' as const,
    },
  };

  it('renders idea title and content', () => {
    render(<IdeaNode {...baseProps} />);

    expect(screen.getByText('Test Idea')).toBeInTheDocument();
    expect(screen.getByText('Some content here')).toBeInTheDocument();
  });

  it('truncates content longer than 100 characters', () => {
    const longContent = 'A'.repeat(150);
    render(<IdeaNode {...baseProps} data={{ ...baseProps.data, content: longContent }} />);

    expect(screen.getByText('A'.repeat(100) + '...')).toBeInTheDocument();
  });

  it('shows context label', () => {
    render(<IdeaNode {...baseProps} />);

    expect(screen.getByText('operations')).toBeInTheDocument();
  });

  it('renders color-coded by context', () => {
    const { container } = render(
      <IdeaNode {...baseProps} data={{ ...baseProps.data, context: 'finance' }} />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('bg-blue-500/10');
    expect(wrapper.className).toContain('border-blue-500/30');
  });

  it('renders with selection ring when selected', () => {
    const { container } = render(<IdeaNode {...baseProps} selected={true} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('ring-2');
  });

  it('renders handles for connections', () => {
    render(<IdeaNode {...baseProps} />);

    expect(screen.getByTestId('handle-target-top')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-bottom')).toBeInTheDocument();
  });

  it('shows "Untitled" when title is empty', () => {
    render(<IdeaNode {...baseProps} data={{ ...baseProps.data, title: '' }} />);

    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });
});

// ============================================================
// NoteNode Tests
// ============================================================

import { NoteNode } from '../canvas/nodes/NoteNode';

describe('NoteNode', () => {
  const baseProps: any = {
    id: 'note-1',
    type: 'note',
    selected: false,
    zIndex: 0,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    dragging: false,
    data: {
      text: 'Hello World',
      onTextChange: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders note text in display mode', () => {
    render(<NoteNode {...baseProps} />);

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('shows placeholder when text is empty', () => {
    render(<NoteNode {...baseProps} data={{ text: '', onTextChange: vi.fn() }} />);

    expect(screen.getByText('Doppelklick zum Bearbeiten...')).toBeInTheDocument();
  });

  it('enters edit mode on double-click', () => {
    render(<NoteNode {...baseProps} />);

    const textDisplay = screen.getByText('Hello World');
    fireEvent.doubleClick(textDisplay);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('Hello World');
  });

  it('calls onTextChange when editing and blurring', () => {
    const onTextChange = vi.fn();
    render(<NoteNode {...baseProps} data={{ text: 'Hello', onTextChange }} />);

    // Enter edit mode
    fireEvent.doubleClick(screen.getByText('Hello'));

    // Change text
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated text' } });

    // Blur to save
    fireEvent.blur(textarea);

    expect(onTextChange).toHaveBeenCalledWith('note-1', 'Updated text');
  });

  it('cancels editing on Escape', () => {
    render(<NoteNode {...baseProps} />);

    fireEvent.doubleClick(screen.getByText('Hello World'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Changed' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    // Should be back in display mode with original text
    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders handles for connections', () => {
    render(<NoteNode {...baseProps} />);

    expect(screen.getByTestId('handle-target-top')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-bottom')).toBeInTheDocument();
  });
});

// ============================================================
// ImageNode Tests
// ============================================================

import { ImageNode } from '../canvas/nodes/ImageNode';

describe('ImageNode', () => {
  const baseProps: any = {
    id: 'img-1',
    type: 'image',
    selected: false,
    zIndex: 0,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    dragging: false,
    data: {
      src: 'https://example.com/image.png',
      alt: 'Test image',
      caption: 'A test caption',
    },
  };

  it('renders image with correct src and alt', () => {
    render(<ImageNode {...baseProps} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/image.png');
    expect(img).toHaveAttribute('alt', 'Test image');
  });

  it('renders caption when provided', () => {
    render(<ImageNode {...baseProps} />);

    expect(screen.getByText('A test caption')).toBeInTheDocument();
  });

  it('does not render caption when not provided', () => {
    render(<ImageNode {...baseProps} data={{ src: 'https://example.com/img.png' }} />);

    expect(screen.queryByText('A test caption')).not.toBeInTheDocument();
  });

  it('uses default alt text when alt is not provided', () => {
    render(<ImageNode {...baseProps} data={{ src: 'https://example.com/img.png' }} />);

    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Board-Bild');
  });

  it('renders as a link that opens in new tab', () => {
    render(<ImageNode {...baseProps} />);

    const link = screen.getByTitle('Klicken zum Vergrößern');
    expect(link).toHaveAttribute('href', 'https://example.com/image.png');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders handles for connections', () => {
    render(<ImageNode {...baseProps} />);

    expect(screen.getByTestId('handle-target-top')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source-bottom')).toBeInTheDocument();
  });

  it('renders with selection ring when selected', () => {
    const { container } = render(<ImageNode {...baseProps} selected={true} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('ring-2');
  });
});
