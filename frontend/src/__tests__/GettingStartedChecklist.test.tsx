// frontend/src/__tests__/GettingStartedChecklist.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GettingStartedChecklist } from '../components/onboarding/GettingStartedChecklist';

beforeEach(() => {
  localStorage.clear();
});

test('renders checklist when not dismissed', () => {
  render(<GettingStartedChecklist />);
  expect(screen.getByText('Erste Schritte')).toBeInTheDocument();
  expect(screen.getByText('0 von 5 erledigt')).toBeInTheDocument();
});

test('dismiss button hides checklist', async () => {
  const user = userEvent.setup();
  render(<GettingStartedChecklist />);
  await user.click(screen.getByLabelText('Schließen'));
  expect(screen.queryByText('Erste Schritte')).not.toBeInTheDocument();
});

test('clicking a step marks it done', async () => {
  const user = userEvent.setup();
  render(<GettingStartedChecklist />);
  await user.click(screen.getByText('Erste Chat-Nachricht senden').closest('button')!);
  expect(screen.getByText('1 von 5 erledigt')).toBeInTheDocument();
});
