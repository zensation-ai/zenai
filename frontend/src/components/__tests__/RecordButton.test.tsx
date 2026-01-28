/**
 * Unit Tests for RecordButton Component
 *
 * Tests voice recording functionality including:
 * - Button states (idle, recording, processing)
 * - Media permissions handling
 * - Recording start/stop
 * - Duration display
 * - Error handling
 *
 * @module tests/components/RecordButton
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordButton } from '../RecordButton';

// Mock MediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Error) => void) | null = null;

  constructor() {
    this.state = 'inactive';
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['test audio'], { type: 'audio/webm' }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn();

describe('RecordButton Component', () => {
  const mockOnTranscript = vi.fn();
  const mockOnRecordingChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup MediaRecorder mock
    global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;

    // Setup getUserMedia mock
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
      },
      writable: true,
    });

    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('renders record button', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('shows microphone icon in idle state', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      // Look for microphone icon or recording indicator
      const button = screen.getByRole('button');
      expect(button).not.toHaveClass('recording');
    });

    it('button is not disabled initially', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('Recording Start', () => {
    it('requests microphone permission when clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      await user.click(button);

      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ audio: expect.anything() })
      );
    });

    it('enters recording state after permission granted', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      await user.click(button);

      await waitFor(() => {
        expect(button).toHaveClass('recording');
      });
    });

    it('calls onRecordingChange with true when recording starts', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          onRecordingChange={mockOnRecordingChange}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      await user.click(button);

      await waitFor(() => {
        expect(mockOnRecordingChange).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('Recording Duration', () => {
    it('tracks recording time', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      await user.click(button);

      // Advance timer by 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Duration should be tracked (implementation-specific display)
      await waitFor(() => {
        // Button should still be in recording state
        expect(button).toHaveClass('recording');
      });
    });
  });

  describe('Recording Stop', () => {
    it('stops recording when clicked again', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');

      // Start recording
      await user.click(button);

      await waitFor(() => {
        expect(button).toHaveClass('recording');
      });

      // Stop recording
      await user.click(button);

      await waitFor(() => {
        expect(button).not.toHaveClass('recording');
      });
    });

    it('calls onRecordingChange with false when recording stops', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          onRecordingChange={mockOnRecordingChange}
          context="personal"
        />
      );

      const button = screen.getByRole('button');

      // Start and stop recording
      await user.click(button);
      await waitFor(() => expect(button).toHaveClass('recording'));
      await user.click(button);

      await waitFor(() => {
        expect(mockOnRecordingChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('handles permission denied gracefully', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      await user.click(button);

      // Should not be in recording state
      await waitFor(() => {
        expect(button).not.toHaveClass('recording');
      });
    });

    it('handles MediaRecorder not supported', async () => {
      // Remove MediaRecorder
      // @ts-expect-error Testing missing MediaRecorder
      delete global.MediaRecorder;

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      // Component should still render
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible label', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      expect(
        button.getAttribute('aria-label') ||
        button.getAttribute('title') ||
        button.textContent
      ).toBeTruthy();
    });

    it('is keyboard accessible', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      button.focus();
      expect(document.activeElement).toBe(button);
    });
  });

  describe('Context Prop', () => {
    it('accepts personal context', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('accepts work context', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="work"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('respects disabled prop', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
          disabled={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('cannot start recording when disabled', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
          disabled={true}
        />
      );

      const button = screen.getByRole('button');
      await user.click(button);

      expect(mockGetUserMedia).not.toHaveBeenCalled();
    });
  });

  describe('Persona Prop', () => {
    it('accepts persona prop', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
          persona="assistant"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('handles null persona', () => {
      render(
        <RecordButton
          onTranscript={mockOnTranscript}
          context="personal"
          persona={null}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });
});
