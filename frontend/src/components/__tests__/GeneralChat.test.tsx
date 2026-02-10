/**
 * Unit Tests for GeneralChat Component
 *
 * Tests chat functionality including:
 * - Message sending and receiving
 * - Session management
 * - Vision/image integration
 * - Loading states
 * - Error handling
 *
 * @module tests/components/GeneralChat
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mocked } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { GeneralChat } from '../GeneralChat';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

// Mock Toast
vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

// Mock AI Personality
vi.mock('../../utils/aiPersonality', () => ({
  AI_PERSONALITY: { name: 'TestAI' },
  AI_AVATAR: { emoji: '🤖', thinkingEmoji: '🤔' },
  EMPTY_STATE_MESSAGES: {
    chat: {
      title: 'Test Title',
      description: 'Test Description',
      encouragement: 'Test Encouragement',
    },
  },
  getRandomMessage: vi.fn(() => 'Thinking...'),
}));

// Helper to create mock file
const createMockFile = (name: string = 'test.png'): File => {
  const content = new Uint8Array(1024);
  return new File([content], name, { type: 'image/png' });
};

// Helper to upload files using fireEvent (more robust for hidden inputs)
const uploadFiles = (input: HTMLInputElement, files: File | File[]) => {
  const fileList = Array.isArray(files) ? files : [files];
  Object.defineProperty(input, 'files', {
    value: fileList,
    configurable: true,
  });
  fireEvent.change(input);
};

// Helper to create a mock SSE response for streaming
const createMockSSEResponse = (content: string = 'Test response') => {
  const encoder = new TextEncoder();
  const sseData = `data: ${JSON.stringify({ content })}\n\n`;

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  );
};

describe('GeneralChat Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for session list (empty)
    mockedAxios.get.mockResolvedValue({
      data: { sessions: [] },
    });

    // Default mock for session creation
    mockedAxios.post.mockResolvedValue({
      data: {
        session: { id: 'test-session-id' },
        userMessage: {
          id: 'msg-1',
          sessionId: 'test-session-id',
          role: 'user',
          content: 'Test message',
          createdAt: new Date().toISOString(),
        },
        assistantMessage: {
          id: 'msg-2',
          sessionId: 'test-session-id',
          role: 'assistant',
          content: 'Test response',
          createdAt: new Date().toISOString(),
        },
      },
    });

    // Mock axios.isCancel (type predicate requires any cast)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedAxios as any).isCancel = vi.fn(() => false);

    // Mock fetch for SSE streaming endpoint
    global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================
  // Rendering Tests
  // ===========================================

  describe('Rendering', () => {
    it('should render empty state initially', async () => {
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByText('Test Title')).toBeInTheDocument();
        expect(screen.getByText('Test Description')).toBeInTheDocument();
      });
    });

    it('should render input area', async () => {
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });
    });

    it('should render send button', async () => {
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Nachricht senden/i })).toBeInTheDocument();
      });
    });

    it('should render image upload button', async () => {
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Bild hinzufügen/i })).toBeInTheDocument();
      });
    });

    it('should show loading state', async () => {
      // Mock slow API response
      mockedAxios.get.mockImplementation(() => new Promise(() => {}));

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByRole('status')).toBeInTheDocument();
      });
    });

    it('should apply compact class when isCompact is true', async () => {
      render(<GeneralChat context="personal" isCompact />);

      await waitFor(() => {
        const chat = document.querySelector('.general-chat');
        expect(chat).toHaveClass('compact');
      });
    });
  });

  // ===========================================
  // Message Sending Tests
  // ===========================================

  describe('Message Sending', () => {
    it('should send message when button is clicked', async () => {
      const user = userEvent.setup();
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Frag mich etwas/i);
      await user.type(input, 'Hello AI');

      const sendButton = screen.getByRole('button', { name: /Nachricht senden/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/sessions'),
          expect.objectContaining({ context: 'personal' })
        );
      });
    });

    it('should send message on Enter key', async () => {
      const user = userEvent.setup();
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Frag mich etwas/i);
      await user.type(input, 'Hello AI{Enter}');

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should not send empty message', async () => {
      const user = userEvent.setup();
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const sendButton = screen.getByRole('button', { name: /Nachricht senden/i });
      expect(sendButton).toBeDisabled();

      await user.click(sendButton);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should clear input after sending', async () => {
      const user = userEvent.setup();
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Frag mich etwas/i) as HTMLTextAreaElement;
      await user.type(input, 'Test message');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });

    it('should disable input while sending', async () => {
      const user = userEvent.setup();

      // Make API call hang
      mockedAxios.post.mockImplementation(() => new Promise(() => {}));

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Frag mich etwas/i);
      await user.type(input, 'Test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(input).toBeDisabled();
      });
    });
  });

  // ===========================================
  // Vision Integration Tests
  // ===========================================

  describe('Vision Integration', () => {
    it('should enable send button when only image is selected', async () => {
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      // Select image via file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile();

      uploadFiles(fileInput, file);

      await waitFor(() => {
        const sendButton = screen.getByRole('button', { name: /Nachricht senden/i });
        expect(sendButton).not.toBeDisabled();
      });
    });

    it('should change placeholder when image is selected', async () => {
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile();

      uploadFiles(fileInput, file);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frage zum Bild/i)).toBeInTheDocument();
      });
    });

    it('should use vision endpoint when sending with images', async () => {
      const user = userEvent.setup();
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      // Select image
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadFiles(fileInput, createMockFile());

      // Wait for placeholder to change indicating image is selected
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frage zum Bild/i)).toBeInTheDocument();
      });

      // Type message
      const input = screen.getByPlaceholderText(/Frage zum Bild/i);
      await user.type(input, 'What is in this image?');

      // Send
      const sendButton = screen.getByRole('button', { name: /Nachricht senden/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining('/messages/vision'),
          expect.any(FormData),
          expect.objectContaining({
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        );
      });
    });

    it('should clear images after sending', async () => {
      const user = userEvent.setup();
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadFiles(fileInput, createMockFile());

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frage zum Bild/i)).toBeInTheDocument();
      });

      const sendButton = screen.getByRole('button', { name: /Nachricht senden/i });
      await user.click(sendButton);

      await waitFor(() => {
        // Placeholder should change back
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });
    });
  });

  // ===========================================
  // Session Management Tests
  // ===========================================

  describe('Session Management', () => {
    it('should load existing session on mount', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            sessions: [{ id: 'existing-session' }],
          },
        })
        .mockResolvedValueOnce({
          data: {
            session: {
              id: 'existing-session',
              messages: [
                {
                  id: 'msg-1',
                  role: 'user',
                  content: 'Previous message',
                  createdAt: new Date().toISOString(),
                },
                {
                  id: 'msg-2',
                  role: 'assistant',
                  content: 'Previous response',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          },
        });

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByText('Previous message')).toBeInTheDocument();
        expect(screen.getByText('Previous response')).toBeInTheDocument();
      });
    });

    it('should create new session when none exists', async () => {
      const user = userEvent.setup();
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Frag mich etwas/i);
      await user.type(input, 'First message{Enter}');

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          '/api/chat/sessions',
          expect.objectContaining({ context: 'personal' })
        );
      });
    });

    it('should show new chat button after session exists', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { sessions: [{ id: 'session-1' }] },
        })
        .mockResolvedValueOnce({
          data: {
            session: {
              id: 'session-1',
              messages: [
                { id: 'm1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() },
              ],
            },
          },
        });

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Neue Chat-Session/i })).toBeInTheDocument();
      });
    });
  });

  // ===========================================
  // Message Display Tests
  // ===========================================

  describe('Message Display', () => {
    it('should display user message with correct styling', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { sessions: [{ id: 's1' }] },
        })
        .mockResolvedValueOnce({
          data: {
            session: {
              id: 's1',
              messages: [
                {
                  id: 'm1',
                  role: 'user',
                  content: 'User message',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          },
        });

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        const message = screen.getByText('User message');
        const messageContainer = message.closest('.chat-message');
        expect(messageContainer).toHaveClass('user');
      });
    });

    it('should display assistant message with AI name', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { sessions: [{ id: 's1' }] },
        })
        .mockResolvedValueOnce({
          data: {
            session: {
              id: 's1',
              messages: [
                {
                  id: 'm1',
                  role: 'assistant',
                  content: 'AI response',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          },
        });

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByText('TestAI')).toBeInTheDocument();
        expect(screen.getByText('AI response')).toBeInTheDocument();
      });
    });

    it('should show typing indicator while sending', async () => {
      const user = userEvent.setup();

      // First call creates session, second call (vision upload) hangs
      mockedAxios.post
        .mockResolvedValueOnce({
          data: { session: { id: 'test-session-id' } },
        })
        .mockImplementation(() => new Promise(() => {})); // Vision upload hangs

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      // Upload image to trigger vision endpoint (uses axios, not fetch streaming)
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      uploadFiles(fileInput, createMockFile());

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frage zum Bild/i)).toBeInTheDocument();
      });

      // Send with image - this uses axios.post which we made hang
      const sendButton = screen.getByRole('button', { name: /Nachricht senden/i });
      await user.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText('Thinking...')).toBeInTheDocument();
      });
    });

    it('should render markdown formatting', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { sessions: [{ id: 's1' }] },
        })
        .mockResolvedValueOnce({
          data: {
            session: {
              id: 's1',
              messages: [
                {
                  id: 'm1',
                  role: 'assistant',
                  content: '**Bold text** and *italic*',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          },
        });

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByText('Bold text')).toBeInTheDocument();
        const boldElement = screen.getByText('Bold text');
        expect(boldElement.tagName).toBe('STRONG');
      });
    });
  });

  // ===========================================
  // Context Tests
  // ===========================================

  describe('Context Handling', () => {
    it('should load personal context sessions', async () => {
      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('context=personal'),
          expect.any(Object)
        );
      });
    });

    it('should load work context sessions', async () => {
      render(<GeneralChat context="work" />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('context=work'),
          expect.any(Object)
        );
      });
    });

    it('should reload sessions when context changes', async () => {
      const { rerender } = render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('context=personal'),
          expect.any(Object)
        );
      });

      rerender(<GeneralChat context="work" />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('context=work'),
          expect.any(Object)
        );
      });
    });
  });

  // ===========================================
  // Error Handling Tests
  // ===========================================

  describe('Error Handling', () => {
    it('should restore input on send error', async () => {
      const user = userEvent.setup();

      // Mock fetch to reject (text messages use SSE streaming via fetch)
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      render(<GeneralChat context="personal" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Frag mich etwas/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Frag mich etwas/i) as HTMLTextAreaElement;
      await user.type(input, 'Test message');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(input.value).toBe('Test message');
      });
    });
  });
});
