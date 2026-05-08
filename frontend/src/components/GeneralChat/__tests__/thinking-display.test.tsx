import { render, screen } from '@testing-library/react';
import { ThinkingBlock } from '../ThinkingBlock';

describe('ThinkingBlock display modes', () => {
  it('renders nothing when content is empty', () => {
    const { container } = render(
      <ThinkingBlock content="" isStreaming={false} displayMode="visible" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('omitted mode filtering happens in ChatMessageList (component still renders with content)', () => {
    // ThinkingBlock itself renders for all modes when content exists;
    // the omitted check is in ChatMessageList: `thinkingTier.display !== 'omitted'`
    const { container } = render(
      <ThinkingBlock content="test" isStreaming={false} displayMode="omitted" />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('renders collapsed for collapsible mode', () => {
    render(
      <ThinkingBlock content="A long thinking content that should be truncated in collapsible mode" isStreaming={false} displayMode="collapsible" label="Standard Thinking" />
    );
    expect(screen.getByText(/Standard Thinking/)).toBeInTheDocument();
  });

  it('renders expanded for visible mode', () => {
    render(
      <ThinkingBlock content="Deep analysis content" isStreaming={false} displayMode="visible" label="Deep Thinking" />
    );
    expect(screen.getByText(/Deep analysis content/)).toBeInTheDocument();
  });

  it('renders with progress indicator for visible_progress mode', () => {
    render(
      <ThinkingBlock content="Strategic analysis" isStreaming={true} displayMode="visible_progress" label="Maximum Thinking" />
    );
    expect(screen.getByText(/Maximum Thinking/)).toBeInTheDocument();
    expect(screen.getByText(/Strategic analysis/)).toBeInTheDocument();
  });
});
