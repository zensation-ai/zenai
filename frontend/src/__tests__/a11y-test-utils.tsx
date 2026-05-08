/**
 * Shared Accessibility Test Utilities
 *
 * Provides renderA11y() for axe-core testing of page components.
 * AuthContext must be mocked at module level in the test file via vi.mock.
 * This utility provides QueryClient + MemoryRouter wrapping.
 */

import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider } from '../components/ConfirmDialog';

// Polyfill HTMLCanvasElement.getContext for jsdom (needed by axe-core icon ligature detection).
// jsdom defines getContext but throws "Not implemented" — override unconditionally.
if (typeof HTMLCanvasElement !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    measureText: () => ({ width: 0 }),
    fillText: () => {},
    font: '',
  });
}

/**
 * Default axe-core rules to disable in test wrappers.
 * - landmark-no-duplicate-banner / landmark-unique: test wrappers add DOM that duplicates page headers
 */
export const AXE_PAGE_RULES: Record<string, { enabled: boolean }> = {
  'landmark-no-duplicate-banner': { enabled: false },
  'landmark-unique': { enabled: false },
};

/**
 * Render a component wrapped in QueryClientProvider + MemoryRouter + ConfirmProvider for a11y testing.
 * API calls are suppressed by QueryClient config (no retries, infinite staleTime).
 */
export function renderA11y(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConfirmProvider>
          {ui}
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
