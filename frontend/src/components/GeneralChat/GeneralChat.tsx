/**
 * GeneralChat Component
 *
 * A ChatGPT-like chat interface for general questions and conversations.
 * Integrated into the main hero section alongside the voice memo input.
 * Features humanized AI personality with consistent branding.
 */

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import axios from 'axios';
import { showToast } from '../Toast';
import { getErrorMessage } from '../../utils/errors';
import { safeLocalStorage } from '../../utils/storage';
import { ArtifactButton } from '../ArtifactButton';
import { ErrorBoundary } from '../ErrorBoundary';
import { extractArtifacts, type Artifact } from '../../types/artifacts';
import '../GeneralChat.css';
import { logError } from '../../utils/errors';

import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import type { ChatMessage, GeneralChatProps } from './types';

// Lazy-load ArtifactPanel (pulls in react-syntax-highlighter ~200KB + react-markdown)
const ArtifactPanel = lazy(() => import('../ArtifactPanel').then(m => ({ default: m.ArtifactPanel })));
// Lazy-load VoiceChat overlay
const VoiceChatOverlay = lazy(() => import('../VoiceChat').then(m => ({ default: m.VoiceChat })));

export function GeneralChat({ context, isCompact = false, assistantMode = false }: GeneralChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  // Streaming state for real-time token display
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingContent, setThinkingContent] = useState<string>('');
  // Inline error message for assistant mode (toast is hidden behind panel)
  const [inlineError, setInlineError] = useState<string | null>(null);
  // Thinking partner mode state (Phase 32C-1)
  const [thinkingMode, setThinkingMode] = useState<'assist' | 'challenge' | 'coach' | 'synthesize'>('assist');
  // Voice chat overlay state
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  // Artifacts state
  const [artifacts, setArtifacts] = useState<Map<string, Artifact[]>>(new Map());
  const [activeArtifact, setActiveArtifact] = useState<{ artifact: Artifact; messageId: string; index: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load last session on mount
  useEffect(() => {
    // Abort any previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    loadLastSession(abortControllerRef.current.signal);

    // Cleanup: abort on unmount or context change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [context]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Listen for quick action input events from FloatingAssistant
  useEffect(() => {
    if (!assistantMode) return;
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt;
      if (prompt) {
        setInputValue(prompt);
        inputRef.current?.focus();
      }
    };
    window.addEventListener('zenai-assistant-fill-input', handler);
    return () => window.removeEventListener('zenai-assistant-fill-input', handler);
  }, [assistantMode]);

  const loadLastSession = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      // Get list of sessions for current context
      const typeFilter = assistantMode ? '&type=assistant' : '';
      const res = await axios.get(`/api/chat/sessions?context=${context}&limit=1${typeFilter}`, { signal });
      const sessions = res.data.data?.sessions || [];

      if (sessions.length > 0) {
        // Load the most recent session
        const lastSession = sessions[0];
        await loadSession(lastSession.id, signal);
      }
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      // No existing session, that's fine - user will start fresh
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async (id: string, signal?: AbortSignal) => {
    try {
      const res = await axios.get(`/api/chat/sessions/${id}`, { signal });
      const session = res.data.data?.session;
      if (session) {
        setSessionId(session.id);
        setMessages(session.messages || []);
      }
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      logError('GeneralChat:loadSession', err);
    }
  };

  const createNewSession = async (): Promise<string | null> => {
    try {
      const sessionPayload: Record<string, string> = { context };
      if (assistantMode) sessionPayload.type = 'assistant';
      const res = await axios.post('/api/chat/sessions', sessionPayload);
      const session = res.data.data?.session;
      if (session) {
        setSessionId(session.id);
        setMessages([]);
        return session.id;
      }
      return null;
    } catch (err) {
      const msg = 'Ups, ich konnte gerade keine neue Unterhaltung starten.';
      if (assistantMode) {
        setInlineError(msg);
      } else {
        showToast(msg, {
          type: 'error',
          duration: 8000,
          onUndo: () => {
            createNewSession();
          },
          undoLabel: 'Erneut versuchen',
        });
      }
      return null;
    }
  };

  /**
   * Send message with SSE streaming support
   * Uses Server-Sent Events for real-time token-by-token display
   */
  const handleSendMessage = useCallback(async () => {
    // Allow sending with only images (no text required)
    if ((!inputValue.trim() && selectedImages.length === 0) || sending) return;

    const messageContent = inputValue.trim();
    const imagesToSend = [...selectedImages];
    setInputValue('');
    setSelectedImages([]);
    setSending(true);
    setInlineError(null);

    try {
      // Get or create session
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        currentSessionId = await createNewSession();
        if (!currentSessionId) {
          setSending(false);
          return;
        }
      }

      // Build display content for user message
      const imageIndicator = imagesToSend.length > 0
        ? (imagesToSend.length === 1 ? ' [Bild]' : ` [${imagesToSend.length} Bilder]`)
        : '';
      const displayContent = messageContent + imageIndicator;

      // Optimistically add user message
      const tempUserMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        sessionId: currentSessionId,
        role: 'user',
        content: displayContent,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempUserMessage]);

      if (imagesToSend.length > 0) {
        // Use vision endpoint with FormData (no streaming for vision)
        const formData = new FormData();
        formData.append('message', messageContent);
        imagesToSend.forEach(img => formData.append('images', img));

        // RELIABILITY FIX: Add timeout for image processing to prevent infinite loading
        const res = await axios.post(
          `/api/chat/sessions/${currentSessionId}/messages/vision`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            timeout: 120000, // 2 minute timeout for image processing
          }
        );

        const { userMessage, assistantMessage } = res.data.data;

        // Replace temp message with real ones
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMessage.id);
          return [...filtered, userMessage, assistantMessage];
        });
      } else {
        // Use SSE streaming for text-only messages
        setIsStreaming(true);
        setStreamingContent('');
        setThinkingContent('');

        // Create a new AbortController for this streaming request
        const streamAbortController = new AbortController();
        // Store reference for cleanup on unmount
        abortControllerRef.current = streamAbortController;

        try {
          // Build full URL: native fetch doesn't use axios baseURL
          const baseUrl = import.meta.env.VITE_API_URL || '';
          const apiKey = safeLocalStorage('get', 'apiKey') || import.meta.env.VITE_API_KEY;

          const response = await fetch(`${baseUrl}/api/chat/sessions/${currentSessionId}/messages/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
            },
            body: JSON.stringify({
              message: messageContent,
              thinking_mode: assistantMode ? 'assist' : thinkingMode,
              ...(assistantMode && { assistantMode: true }),
            }),
            signal: streamAbortController.signal, // Add abort signal to prevent memory leaks
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let accumulatedContent = '';
          let buffer = '';

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE events from buffer
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  // Event type line - handled with next data line
                  continue;
                }
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));

                    // Handle different event types based on data content
                    if (data.content !== undefined) {
                      accumulatedContent += data.content;
                      setStreamingContent(accumulatedContent);
                    }
                    if (data.thinking !== undefined) {
                      // Accumulate thinking deltas (backend now streams chunks)
                      setThinkingContent(prev => prev + data.thinking);
                    }
                    if (data.error) {
                      throw new Error(data.error);
                    }
                  } catch (parseError) {
                    // Skip malformed JSON
                    if (line.slice(6).trim() !== '') {
                      console.warn('Failed to parse SSE data:', line);
                    }
                  }
                }
              }
            }
          }

          // Stream complete - create final assistant message
          const finalAssistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            sessionId: currentSessionId,
            role: 'assistant',
            content: accumulatedContent,
            createdAt: new Date().toISOString(),
          };

          // Update messages with real user message (from temp) and assistant response
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempUserMessage.id);
            const realUserMessage: ChatMessage = {
              ...tempUserMessage,
              id: `user-${Date.now()}`,
            };
            return [...filtered, realUserMessage, finalAssistantMessage];
          });
        } finally {
          setIsStreaming(false);
          setStreamingContent('');
          setThinkingContent('');
        }
      }

    } catch (err) {
      // Don't show error for aborted requests (e.g., component unmount or context change)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage = getErrorMessage(err, 'Deine Nachricht konnte nicht gesendet werden.');

      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
      setInputValue(messageContent); // Restore input
      setSelectedImages(imagesToSend); // Restore images
      setIsStreaming(false);
      setStreamingContent('');
      setThinkingContent('');

      if (assistantMode) {
        // In assistant mode, show error inline (toast is hidden behind the panel)
        setInlineError(errorMessage);
      } else {
        // Show error toast with retry button
        showToast(errorMessage, {
          type: 'error',
          duration: 8000,
          onUndo: () => {
            setTimeout(() => {
              inputRef.current?.focus();
              const form = inputRef.current?.closest('form');
              if (form) {
                form.requestSubmit();
              }
            }, 100);
          },
          undoLabel: 'Erneut senden',
        });
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [inputValue, sending, sessionId, selectedImages, context, assistantMode, thinkingMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = async () => {
    await createNewSession();
    showToast('Neue Chat-Session gestartet', 'success');
  };

  // Extract and cache artifacts from message content
  const getMessageArtifacts = useCallback((messageId: string, content: string): { text: string; messageArtifacts: Artifact[] } => {
    // Check cache first
    const cached = artifacts.get(messageId);
    if (cached) {
      // Return processed text with artifact references
      const { text } = extractArtifacts(content);
      return { text, messageArtifacts: cached };
    }

    // Extract artifacts
    const { text, artifacts: extracted } = extractArtifacts(content);

    // Cache if any found
    if (extracted.length > 0) {
      setArtifacts(prev => new Map(prev).set(messageId, extracted));
    }

    return { text, messageArtifacts: extracted };
  }, [artifacts]);

  // Render markdown-like formatting (safe, no dangerouslySetInnerHTML)
  const renderContent = (content: string, messageId?: string) => {
    // Extract artifacts if messageId provided
    let processedContent = content;
    let messageArtifacts: Artifact[] = [];

    if (messageId) {
      const result = getMessageArtifacts(messageId, content);
      processedContent = result.text;
      messageArtifacts = result.messageArtifacts;
    }

    // Split by code blocks and artifact references
    const parts = processedContent.split(/(```[\s\S]*?```|\[\[ARTIFACT:[^\]]+\]\])/g);

    return parts.map((part, i) => {
      // Check for artifact reference
      const artifactMatch = part.match(/\[\[ARTIFACT:([^\]]+)\]\]/);
      if (artifactMatch) {
        const artifactId = artifactMatch[1];
        const artifact = messageArtifacts.find(a => a.id === artifactId);
        if (artifact && messageId) {
          const artifactIndex = messageArtifacts.indexOf(artifact);
          return (
            <ArtifactButton
              key={i}
              artifact={artifact}
              onClick={() => setActiveArtifact({ artifact, messageId, index: artifactIndex })}
            />
          );
        }
        return null;
      }

      if (part.startsWith('```') && part.endsWith('```')) {
        // Code block - check if it's large enough to be an artifact
        const codeContent = part.slice(3, -3);
        const langMatch = codeContent.match(/^(\w+)\n/);
        const language = langMatch ? langMatch[1] : 'text';
        const code = langMatch ? codeContent.slice(langMatch[0].length) : codeContent;

        // Large code blocks become inline artifacts
        if (code.split('\n').length >= 15 && messageId) {
          const inlineArtifact: Artifact = {
            id: `inline-${messageId}-${i}`,
            title: `${language.charAt(0).toUpperCase() + language.slice(1)} Code`,
            type: 'code',
            language,
            content: code,
          };
          return (
            <ArtifactButton
              key={i}
              artifact={inlineArtifact}
              onClick={() => setActiveArtifact({ artifact: inlineArtifact, messageId, index: -1 })}
            />
          );
        }

        // Small code blocks render inline
        return (
          <pre key={i} className="code-block">
            <code>{code}</code>
          </pre>
        );
      }

      // Process inline formatting safely using React elements
      const renderInlineFormatting = (text: string): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        // Combined regex for bold, italic, inline code
        const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\n)/g;
        let lastIndex = 0;
        let match;
        let keyIndex = 0;

        while ((match = inlineRegex.exec(text)) !== null) {
          // Add text before match
          if (match.index > lastIndex) {
            result.push(text.slice(lastIndex, match.index));
          }

          const matched = match[0];
          if (matched === '\n') {
            result.push(<br key={`br-${keyIndex++}`} />);
          } else if (matched.startsWith('**') && matched.endsWith('**')) {
            result.push(<strong key={`strong-${keyIndex++}`}>{matched.slice(2, -2)}</strong>);
          } else if (matched.startsWith('*') && matched.endsWith('*')) {
            result.push(<em key={`em-${keyIndex++}`}>{matched.slice(1, -1)}</em>);
          } else if (matched.startsWith('`') && matched.endsWith('`')) {
            result.push(<code key={`code-${keyIndex++}`} className="inline-code">{matched.slice(1, -1)}</code>);
          }

          lastIndex = match.index + matched.length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
          result.push(text.slice(lastIndex));
        }

        return result;
      };

      return <span key={i}>{renderInlineFormatting(part)}</span>;
    });
  };

  // Navigate between artifacts in the same message
  const navigateArtifact = useCallback((direction: 'prev' | 'next') => {
    if (!activeArtifact) return;

    const messageArtifacts = artifacts.get(activeArtifact.messageId) || [];
    const currentIndex = activeArtifact.index;

    if (direction === 'prev' && currentIndex > 0) {
      setActiveArtifact({
        artifact: messageArtifacts[currentIndex - 1],
        messageId: activeArtifact.messageId,
        index: currentIndex - 1,
      });
    } else if (direction === 'next' && currentIndex < messageArtifacts.length - 1) {
      setActiveArtifact({
        artifact: messageArtifacts[currentIndex + 1],
        messageId: activeArtifact.messageId,
        index: currentIndex + 1,
      });
    }
  }, [activeArtifact, artifacts]);

  if (loading) {
    return (
      <div className={`general-chat ${isCompact ? 'compact' : ''}`} role="status" aria-live="polite">
        <div className="chat-loading neuro-loading-contextual">
          <div className="loading-spinner neuro-loading-spinner" aria-label="Chat wird geladen" />
        </div>
      </div>
    );
  }

  return (
    <div className={`general-chat liquid-glass ${isCompact ? 'compact' : ''}`}>
      {/* Messages Area */}
      <ChatMessageList
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        thinkingContent={thinkingContent}
        sending={sending}
        renderContent={renderContent}
        messagesEndRef={messagesEndRef}
      />

      {/* Input Area with Thinking Mode and Error Display */}
      <ChatInput
        inputValue={inputValue}
        setInputValue={setInputValue}
        selectedImages={selectedImages}
        setSelectedImages={setSelectedImages}
        sending={sending}
        handleSendMessage={handleSendMessage}
        handleKeyDown={handleKeyDown}
        handleNewChat={handleNewChat}
        sessionId={sessionId}
        inlineError={inlineError}
        setInlineError={setInlineError}
        thinkingMode={thinkingMode}
        setThinkingMode={setThinkingMode}
        voiceChatOpen={voiceChatOpen}
        setVoiceChatOpen={setVoiceChatOpen}
        inputRef={inputRef}
        context={context}
        assistantMode={assistantMode}
      />

      {/* Artifact Panel - lazy-loaded to reduce initial bundle (~200KB saved) */}
      {activeArtifact && (
        <ErrorBoundary fallback={<div className="artifact-error">Artifact konnte nicht angezeigt werden.</div>}>
          <Suspense fallback={<div className="artifact-loading">Lade Artifact...</div>}>
            <ArtifactPanel
              artifact={activeArtifact.artifact}
              onClose={() => setActiveArtifact(null)}
              onPrevious={() => navigateArtifact('prev')}
              onNext={() => navigateArtifact('next')}
              hasPrevious={activeArtifact.index > 0}
              hasNext={activeArtifact.index >= 0 && activeArtifact.index < (artifacts.get(activeArtifact.messageId)?.length || 0) - 1}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Voice Chat Overlay */}
      {voiceChatOpen && (
        <div
          className="voice-chat-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sprachkonversation"
          onKeyDown={(e) => { if (e.key === 'Escape') setVoiceChatOpen(false); }}
        >
          <div
            className="voice-chat-overlay-backdrop"
            onClick={() => setVoiceChatOpen(false)}
            role="presentation"
          />
          <div className="voice-chat-overlay-content">
            <Suspense fallback={<div className="voice-chat-loading">Lade Sprachkonversation...</div>}>
              <VoiceChatOverlay
                context={context}
                apiUrl={import.meta.env.VITE_API_URL || ''}
                apiKey={import.meta.env.VITE_API_KEY || ''}
                onClose={() => setVoiceChatOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
