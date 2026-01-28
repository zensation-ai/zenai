/**
 * VoiceInput Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceInput } from '../VoiceInput';

// Mock navigator.mediaDevices
const mockMediaStream = {
  getTracks: () => [{ stop: vi.fn() }],
};

const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null as ((event: { data: Blob }) => void) | null,
  onstop: null as (() => void) | null,
  state: 'inactive',
};

// Mock global objects
beforeEach(() => {
  // Mock MediaRecorder
  vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(() => mockMediaRecorder));
  (MediaRecorder as unknown as { isTypeSupported: (type: string) => boolean }).isTypeSupported = () => true;

  // Mock navigator.mediaDevices
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
    },
    writable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VoiceInput', () => {
  it('should render with microphone icon', () => {
    const onTranscript = vi.fn();
    render(<VoiceInput onTranscript={onTranscript} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Spracheingabe starten');
  });

  it('should be disabled when disabled prop is true', () => {
    const onTranscript = vi.fn();
    render(<VoiceInput onTranscript={onTranscript} disabled={true} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should start recording on click', async () => {
    const onTranscript = vi.fn();
    const onRecordingChange = vi.fn();
    render(
      <VoiceInput
        onTranscript={onTranscript}
        onRecordingChange={onRecordingChange}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });
  });

  it('should have recording state class when recording', async () => {
    const onTranscript = vi.fn();
    render(<VoiceInput onTranscript={onTranscript} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveClass('recording');
    });
  });

  it('should apply compact class when compact prop is true', () => {
    const onTranscript = vi.fn();
    render(<VoiceInput onTranscript={onTranscript} compact={true} />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('compact');
  });

  it('should not apply compact class when compact prop is false', () => {
    const onTranscript = vi.fn();
    render(<VoiceInput onTranscript={onTranscript} compact={false} />);

    const button = screen.getByRole('button');
    expect(button).not.toHaveClass('compact');
  });
});
