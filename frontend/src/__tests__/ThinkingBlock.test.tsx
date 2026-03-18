/**
 * ThinkingBlock Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThinkingBlock } from '../components/GeneralChat/ThinkingBlock';

describe('ThinkingBlock', () => {
  const shortContent = 'I am thinking about this problem.';
  const longContent = 'A'.repeat(200) + ' This is the end of the thinking content that should be truncated in preview mode.';

  it('should render nothing when content is empty', () => {
    const { container } = render(<ThinkingBlock content="" isStreaming={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('should render collapsed by default with "Gedankengang" label', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    expect(screen.getByText('Gedankengang')).toBeTruthy();
  });

  it('should show preview text when collapsed', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    expect(screen.getByText(shortContent)).toBeTruthy();
  });

  it('should truncate preview for long content', () => {
    render(<ThinkingBlock content={longContent} isStreaming={false} />);
    // Preview should contain "..." at end (truncated)
    const preview = screen.getByText(/\.\.\.$/);
    expect(preview).toBeTruthy();
  });

  it('should have aria-expanded=false when collapsed', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    const toggle = screen.getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('should expand on click and show full content', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    const toggle = screen.getByRole('button');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Full content should be visible in a <pre> tag
    const preElement = document.querySelector('.thinking-block-text');
    expect(preElement?.textContent).toBe(shortContent);
  });

  it('should collapse on second click', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    const toggle = screen.getByRole('button');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('should toggle on Enter key', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    const toggle = screen.getByRole('button');

    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('should toggle on Space key', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    const toggle = screen.getByRole('button');

    fireEvent.keyDown(toggle, { key: ' ' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('should show streaming indicator when isStreaming=true', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={true} />);
    expect(screen.getByText('...')).toBeTruthy();
    expect(screen.getByLabelText('denkt noch nach')).toBeTruthy();
  });

  it('should add streaming CSS class when streaming', () => {
    const { container } = render(<ThinkingBlock content={shortContent} isStreaming={true} />);
    const block = container.querySelector('.thinking-block--streaming');
    expect(block).toBeTruthy();
  });

  it('should not add streaming CSS class when not streaming', () => {
    const { container } = render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    const block = container.querySelector('.thinking-block--streaming');
    expect(block).toBeNull();
  });

  it('should have a region role with correct label', () => {
    render(<ThinkingBlock content={shortContent} isStreaming={false} />);
    expect(screen.getByRole('region', { name: 'KI-Gedankengang' })).toBeTruthy();
  });
});
