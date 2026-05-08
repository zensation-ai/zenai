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
    context: 'operations' as const,
    onContextChange: vi.fn(),
    onComplete: vi.fn(),
  };

  it('renders step 1 (Welcome) by default', () => {
    render(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByText('ZenAI')).toBeInTheDocument();
    expect(screen.getByText('Dein persönlicher KI-Assistent')).toBeInTheDocument();
    expect(screen.getByText("Los geht's")).toBeInTheDocument();
  });

  it('advances to step 2 on button click', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    await user.click(screen.getByText("Los geht's"));

    expect(screen.getByText('Wähle deinen Hauptkontext')).toBeInTheDocument();
    expect(screen.getByText('Operativ')).toBeInTheDocument();
    expect(screen.getByText('Finanzen')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Strategie')).toBeInTheDocument();
  });

  it('can go back from step 2 to step 1', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    await user.click(screen.getByText("Los geht's"));
    expect(screen.getByText('Wähle deinen Hauptkontext')).toBeInTheDocument();

    await user.click(screen.getByText('Zurück'));
    expect(screen.getByText('ZenAI')).toBeInTheDocument();
  });

  it('context selection updates selected state', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Go to step 2
    await user.click(screen.getByText("Los geht's"));

    // Click 'Finanzen' context card
    const financeButton = screen.getByText('Finanzen').closest('button');
    expect(financeButton).toBeTruthy();
    await user.click(financeButton!);

    // The button should have aria-pressed=true
    expect(financeButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onContextChange when advancing from step 2', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    await user.click(screen.getByText("Los geht's"));

    // Select finance context
    const financeButton = screen.getByText('Finanzen').closest('button');
    await user.click(financeButton!);

    // Advance to step 3
    await user.click(screen.getByText('Weiter'));

    expect(defaultProps.onContextChange).toHaveBeenCalledWith('finance');
  });

  it('can skip idea creation in step 3', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Navigate to step 3 (Idea creation: Welcome → Context → Idea)
    await user.click(screen.getByText("Los geht's"));
    await user.click(screen.getByText('Weiter'));

    expect(screen.getByText('Deine erste Idee')).toBeInTheDocument();
    expect(screen.getByText('Überspringen')).toBeInTheDocument();

    await user.click(screen.getByText('Überspringen'));

    // Should be on step 4 (AI Discovery)
    expect(screen.getByText('Die KI denkt mit')).toBeInTheDocument();
  });

  it('shows all 5 features in step 5 (Feature Tour)', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Navigate through: Welcome → Context → Idea(skip) → AI Discovery → Feature Tour
    await user.click(screen.getByText("Los geht's"));
    await user.click(screen.getByText('Weiter'));
    await user.click(screen.getByText('Überspringen'));
    await user.click(screen.getByText('Beeindruckend! Weiter →'));

    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Ideen')).toBeInTheDocument();
    expect(screen.getByText('Planer')).toBeInTheDocument();
    expect(screen.getByText('Dokumente')).toBeInTheDocument();
    expect(screen.getByText('My AI')).toBeInTheDocument();
  });

  it('calls onComplete on finish', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Navigate to final step (6 steps total)
    await user.click(screen.getByText("Los geht's"));
    await user.click(screen.getByText('Weiter'));
    await user.click(screen.getByText('Überspringen'));
    await user.click(screen.getByText('Beeindruckend! Weiter →'));
    await user.click(screen.getByText('Tour abschließen →'));

    expect(screen.getByText(/Loslegen/)).toBeInTheDocument();
    await user.click(screen.getByText(/Loslegen/));

    expect(defaultProps.onComplete).toHaveBeenCalledTimes(1);
  });

  it('submits idea in step 3 when text is entered', async () => {
    const axios = (await import('axios')).default;
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);

    // Navigate to step 3 (Idea)
    await user.click(screen.getByText("Los geht's"));
    await user.click(screen.getByText('Weiter'));

    // Type idea text
    const textarea = screen.getByPlaceholderText(/Ich möchte eine App bauen/);
    await user.type(textarea, 'Meine erste Idee');

    // Click create
    await user.click(screen.getByText('Idee erstellen'));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/operations/ideas', {
        raw_transcript: 'Meine erste Idee',
      });
    });

    // Should advance to step 4 (AI Discovery)
    await waitFor(() => {
      expect(screen.getByText('Die KI denkt mit')).toBeInTheDocument();
    });
  });

  it('has progress dots matching step count', () => {
    render(<OnboardingWizard {...defaultProps} />);

    const dots = document.querySelectorAll('.onboarding-wizard-dot');
    expect(dots.length).toBe(6);
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
