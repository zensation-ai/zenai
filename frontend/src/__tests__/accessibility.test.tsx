import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { expect, describe, test } from 'vitest';

// Extend expect with toHaveNoViolations at runtime (avoids type-only export issue)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toHaveNoViolations } = require('vitest-axe/matchers') as { toHaveNoViolations: Parameters<typeof expect.extend>[0][string] };
expect.extend({ toHaveNoViolations });

// Import simple leaf components that can render without providers
import { ChatSkeleton, DashboardSkeleton, ListSkeleton } from '../components/skeletons/PageSkeletons';

describe('Accessibility - Skeleton Components', () => {
  test('ChatSkeleton has no a11y violations', async () => {
    const { container } = render(<ChatSkeleton />);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(results).toHaveNoViolations();
  });

  test('DashboardSkeleton has no a11y violations', async () => {
    const { container } = render(<DashboardSkeleton />);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(results).toHaveNoViolations();
  });

  test('ListSkeleton has no a11y violations', async () => {
    const { container } = render(<ListSkeleton />);
    const results = await axe(container);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(results).toHaveNoViolations();
  });
});
