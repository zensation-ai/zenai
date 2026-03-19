// frontend/src/components/ChatHub/__tests__/AdaptiveResult.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdaptiveResult } from '../AdaptiveResult';

describe('AdaptiveResult', () => {
  it('renders text content as paragraph', () => {
    render(<AdaptiveResult type="text" content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders task_card with checkbox and title', () => {
    render(
      <AdaptiveResult
        type="task_card"
        content="Prepare presentation"
        metadata={{ due: 'Tomorrow', priority: 'high' }}
      />
    );
    expect(screen.getByText('Prepare presentation')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders code_block with language label and copy button', () => {
    render(
      <AdaptiveResult
        type="code_block"
        content="console.log('hello')"
        metadata={{ language: 'javascript' }}
      />
    );
    expect(screen.getByText("console.log('hello')")).toBeInTheDocument();
    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByLabelText('Code kopieren')).toBeInTheDocument();
  });

  it('renders event_card with date and time', () => {
    render(
      <AdaptiveResult
        type="event_card"
        content="Meeting with Sarah"
        metadata={{ date: 'Friday', time: '14:00' }}
      />
    );
    expect(screen.getByText('Meeting with Sarah')).toBeInTheDocument();
    expect(screen.getByText(/Friday/)).toBeInTheDocument();
    expect(screen.getByText(/14:00/)).toBeInTheDocument();
  });

  it('falls back to text rendering for unknown types', () => {
    // @ts-expect-error Testing unknown type fallback
    render(<AdaptiveResult type="unknown_type" content="Fallback text" />);
    expect(screen.getByText('Fallback text')).toBeInTheDocument();
  });
});
