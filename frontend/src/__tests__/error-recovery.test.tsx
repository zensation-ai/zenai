/**
 * QueryErrorState Tests
 *
 * Verifies inline error recovery component renders correctly
 * for different error categories.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryErrorState } from '../components/QueryErrorState';
import { AxiosError } from 'axios';

describe('QueryErrorState', () => {
  it('renders error title and description for unknown errors', () => {
    render(<QueryErrorState error={new Error('Something failed')} />);
    expect(screen.getByText('Ein Fehler ist aufgetreten')).toBeDefined();
  });

  it('renders retry button when error is retryable', () => {
    const refetch = vi.fn();
    render(<QueryErrorState error={new Error('fail')} refetch={refetch} />);
    const btn = screen.getByRole('button', { name: 'Erneut versuchen' });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('does not render retry button without refetch prop', () => {
    render(<QueryErrorState error={new Error('fail')} />);
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).toBeNull();
  });

  it('shows network error content for AxiosError without response', () => {
    const axiosErr = new AxiosError('Network Error', 'ERR_NETWORK');
    render(<QueryErrorState error={axiosErr} refetch={() => {}} />);
    expect(screen.getByText('Verbindungsproblem')).toBeDefined();
  });

  it('shows server error for 500 status', () => {
    const axiosErr = new AxiosError('Internal Server Error', '500', undefined, undefined, {
      status: 500,
      statusText: 'Internal Server Error',
      data: {},
      headers: {},
      config: {} as any,
    } as any);
    render(<QueryErrorState error={axiosErr} refetch={() => {}} />);
    expect(screen.getByText('Serverfehler')).toBeDefined();
  });

  it('shows auth error for 401 status', () => {
    const axiosErr = new AxiosError('Unauthorized', '401', undefined, undefined, {
      status: 401,
      statusText: 'Unauthorized',
      data: {},
      headers: {},
      config: {} as any,
    } as any);
    render(<QueryErrorState error={axiosErr} />);
    expect(screen.getByText('Nicht autorisiert')).toBeDefined();
    // Auth errors should NOT show retry button
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).toBeNull();
  });

  it('shows timeout error for 504 status', () => {
    const axiosErr = new AxiosError('Gateway Timeout', '504', undefined, undefined, {
      status: 504,
      statusText: 'Gateway Timeout',
      data: {},
      headers: {},
      config: {} as any,
    } as any);
    render(<QueryErrorState error={axiosErr} refetch={() => {}} />);
    expect(screen.getByText('Zeitüberschreitung')).toBeDefined();
  });

  it('shows rate limit error for 429 status', () => {
    const axiosErr = new AxiosError('Too Many Requests', '429', undefined, undefined, {
      status: 429,
      statusText: 'Too Many Requests',
      data: {},
      headers: {},
      config: {} as any,
    } as any);
    render(<QueryErrorState error={axiosErr} refetch={() => {}} />);
    expect(screen.getByText('Zu viele Anfragen')).toBeDefined();
  });

  it('applies className prop', () => {
    const { container } = render(
      <QueryErrorState error={new Error('fail')} className="custom-error-class" />
    );
    const wrapper = container.querySelector('.custom-error-class');
    expect(wrapper).not.toBeNull();
  });

  it('renders AlertTriangle icon', () => {
    render(<QueryErrorState error={new Error('test')} />);
    // The EmptyState renders the icon with aria-hidden
    const icon = document.querySelector('.ds-empty-state__icon');
    expect(icon).not.toBeNull();
  });
});
