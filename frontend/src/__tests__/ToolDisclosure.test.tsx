/**
 * ToolDisclosure Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolDisclosure } from '../components/GeneralChat/ToolDisclosure';
import type { ToolCall } from '../components/GeneralChat/chatReducer';

describe('ToolDisclosure', () => {
  const sampleTools: ToolCall[] = [
    { name: 'web_search', duration_ms: 1200, status: 'success' },
    { name: 'recall', duration_ms: 300, status: 'success' },
    { name: 'execute_code', duration_ms: 5000, status: 'error' },
  ];

  it('should render nothing when toolCalls is empty', () => {
    const { container } = render(<ToolDisclosure toolCalls={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('should render collapsed summary with tool count', () => {
    render(<ToolDisclosure toolCalls={sampleTools} />);
    expect(screen.getByText(/3 Tools verwendet/)).toBeTruthy();
  });

  it('should show error count when tools failed', () => {
    render(<ToolDisclosure toolCalls={sampleTools} />);
    expect(screen.getByText(/1 fehlgeschlagen/)).toBeTruthy();
  });

  it('should have aria-expanded=false when collapsed', () => {
    render(<ToolDisclosure toolCalls={sampleTools} />);
    const toggle = screen.getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('should expand on click and show tool list', () => {
    render(<ToolDisclosure toolCalls={sampleTools} />);
    const toggle = screen.getByRole('button');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Durchsuche das Web')).toBeTruthy();
    expect(screen.getByText('Erinnere mich')).toBeTruthy();
    expect(screen.getByText('Fuehre Code aus')).toBeTruthy();
  });

  it('should display formatted durations', () => {
    render(<ToolDisclosure toolCalls={sampleTools} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('1.2s')).toBeTruthy();
    expect(screen.getByText('300ms')).toBeTruthy();
    expect(screen.getByText('5.0s')).toBeTruthy();
  });

  it('should collapse on second click', () => {
    render(<ToolDisclosure toolCalls={sampleTools} />);
    const toggle = screen.getByRole('button');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('should show singular "Tool" for single tool', () => {
    render(<ToolDisclosure toolCalls={[sampleTools[0]]} />);
    expect(screen.getByText(/1 Tool verwendet/)).toBeTruthy();
  });

  it('should fallback label for unknown tool names', () => {
    render(<ToolDisclosure toolCalls={[{ name: 'custom_tool_abc', duration_ms: 100, status: 'success' }]} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('custom tool abc')).toBeTruthy();
  });
});
