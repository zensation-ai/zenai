/**
 * Tests for OnboardingWizard, useOnboarding, and SetupChecklist
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingWizard } from '../components/OnboardingWizard/OnboardingWizard';
import { SetupChecklist } from '../components/SetupChecklist';

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock error logger
vi.mock('../utils/errors', () => ({
  logError: vi.fn(),
}));

// localStorage mock
const localStorageMock: Record<string, string> = {};

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(localStorageMock).forEach((key) => delete localStorageMock[key]);

  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
    return localStorageMock[key] ?? null;
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
    localStorageMock[key] = value;
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
    delete localStorageMock[key];
  });
});

describe('OnboardingWizard', () => {
  const defaultProps = {
    context: 'personal' as const,
    onContextChange: vi.fn(),
    onComplete: vi.fn(),
  };

  it('renders step 1 (Welcome) by default', () => {
    render(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByText('ZenAI')).toBeInTheDocument();
    expect(screen.getByText('Dein persoenlicher KI-Assistent')).toBeInTheDocument();
    expect(screen.getByText("Los geht's")).toBeInTheDocument();
  });

  it('advances to step 2 on button click', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    await user.click(screen.getByText("Los geht's"));

    expect(screen.getByText('Waehle deinen Hauptkontext')).toBeInTheDocument();
    expect(screen.getByText('Privat')).toBeInTheDocument();
    expect(screen.getByText('Arbeit')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
    expect(screen.getByText('Kreativ')).toBeInTheDocument();
  });

  it('can go back from step 2 to step 1', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    await user.click(screen.getByText("Los geht's"));
    expect(screen.getByText('Waehle deinen Hauptkontext')).toBeInTheDocument();

    await user.click(screen.getByText('Zurueck'));
    expect(screen.getByText('ZenAI')).toBeInTheDocument();
  });

  it('context selection updates selected state', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Go to step 2
    await user.click(screen.getByText("Los geht's"));

    // Click 'Arbeit' context card
    const workButton = screen.getByText('Arbeit').closest('button');
    expect(workButton).toBeTruthy();
    await user.click(workButton!);

    // The button should have aria-pressed=true
    expect(workButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onContextChange when advancing from step 2', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    await user.click(screen.getByText("Los geht's"));

    // Select work context
    const workButton = screen.getByText('Arbeit').closest('button');
    await user.click(workButton!);

    // Advance to step 3
    await user.click(screen.getByText('Weiter'));

    expect(defaultProps.onContextChange).toHaveBeenCalledWith('work');
  });

  it('can skip idea creation in step 3', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Navigate to step 3
    await user.click(screen.getByText("Los geht's"));
    await user.click(screen.getByText('Weiter'));

    expect(screen.getByText('Deine erste Idee')).toBeInTheDocument();
    expect(screen.getByText('Ueberspringen')).toBeInTheDocument();

    await user.click(screen.getByText('Ueberspringen'));

    // Should be on step 4 (Discovery)
    expect(screen.getByText('Entdecke ZenAI')).toBeInTheDocument();
  });

  it('shows all 4 features in step 4', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Navigate through all steps
    await user.click(screen.getByText("Los geht's"));
    await user.click(screen.getByText('Weiter'));
    await user.click(screen.getByText('Ueberspringen'));

    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Gedanken')).toBeInTheDocument();
    expect(screen.getByText('Werkstatt')).toBeInTheDocument();
    expect(screen.getByText('Insights')).toBeInTheDocument();
  });

  it('calls onComplete on finish', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Navigate to final step
    await user.click(screen.getByText("Los geht's"));
    await user.click(screen.getByText('Weiter'));
    await user.click(screen.getByText('Ueberspringen'));

    expect(screen.getByText('Fertig')).toBeInTheDocument();
    await user.click(screen.getByText('Fertig'));

    expect(defaultProps.onComplete).toHaveBeenCalledTimes(1);
  });

  it('submits idea in step 3 when text is entered', async () => {
    const axios = (await import('axios')).default;
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Navigate to step 3
    await user.click(screen.getByText("Los geht's"));
    await user.click(screen.getByText('Weiter'));

    // Type idea text
    const textarea = screen.getByPlaceholderText(/Ich moechte eine App bauen/);
    await user.type(textarea, 'Meine erste Idee');

    // Click create
    await user.click(screen.getByText('Idee erstellen'));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/personal/ideas', {
        raw_transcript: 'Meine erste Idee',
      });
    });

    // Should advance to step 4
    await waitFor(() => {
      expect(screen.getByText('Entdecke ZenAI')).toBeInTheDocument();
    });
  });

  it('has progress dots matching step count', () => {
    render(<OnboardingWizard {...defaultProps} />);

    const dots = document.querySelectorAll('.onboarding-wizard-dot');
    expect(dots.length).toBe(4);
    expect(dots[0]).toHaveClass('active');
  });
});

describe('SetupChecklist', () => {
  const defaultProps = {
    onNavigate: vi.fn(),
    ideasCount: 0,
  };

  it('renders with correct items', () => {
    localStorageMock['zenai_onboarding_completed'] = 'true';

    render(<SetupChecklist {...defaultProps} />);

    expect(screen.getByText('Erste Schritte')).toBeInTheDocument();
    expect(screen.getByText('Onboarding abgeschlossen')).toBeInTheDocument();
    expect(screen.getByText('Erste Idee erstellt')).toBeInTheDocument();
    expect(screen.getByText('Chat ausprobiert')).toBeInTheDocument();
    expect(screen.getByText('Profil angepasst')).toBeInTheDocument();
  });

  it('shows progress bar with correct count', () => {
    localStorageMock['zenai_onboarding_completed'] = 'true';

    render(<SetupChecklist {...defaultProps} />);

    expect(screen.getByText('1/4 erledigt')).toBeInTheDocument();
  });

  it('marks first-idea as complete when ideasCount > 0', () => {
    localStorageMock['zenai_onboarding_completed'] = 'true';

    render(<SetupChecklist {...defaultProps} ideasCount={3} />);

    expect(screen.getByText('2/4 erledigt')).toBeInTheDocument();
  });

  it('can be dismissed', async () => {
    localStorageMock['zenai_onboarding_completed'] = 'true';
    const user = userEvent.setup();

    const { container } = render(<SetupChecklist {...defaultProps} />);

    expect(screen.getByText('Erste Schritte')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Checkliste ausblenden'));

    // Should be hidden after dismiss
    expect(container.querySelector('.setup-checklist')).toBeNull();
    expect(localStorageMock['zenai_checklist_dismissed']).toBe('true');
  });

  it('navigates to correct page on item click', async () => {
    localStorageMock['zenai_onboarding_completed'] = 'true';
    const user = userEvent.setup();

    render(<SetupChecklist {...defaultProps} />);

    await user.click(screen.getByText('Chat ausprobiert'));

    expect(defaultProps.onNavigate).toHaveBeenCalledWith('chat');
  });

  it('hides when all items are completed', () => {
    localStorageMock['zenai_onboarding_completed'] = 'true';
    localStorageMock['zenai_checklist_first_idea'] = 'true';
    localStorageMock['zenai_checklist_chat_tried'] = 'true';
    localStorageMock['zenai_checklist_profile'] = 'true';

    const { container } = render(<SetupChecklist {...defaultProps} />);

    expect(container.querySelector('.setup-checklist')).toBeNull();
  });
});
