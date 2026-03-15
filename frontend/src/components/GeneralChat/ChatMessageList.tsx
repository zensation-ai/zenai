/**
 * ChatMessageList Component
 *
 * Renders the messages display area including the empty state,
 * message list, streaming response, typing indicator, and stop button.
 */

import { useRef, useEffect, useState, type RefObject } from 'react';
import {
  AI_PERSONALITY,
  AI_AVATAR,
  EMPTY_STATE_MESSAGES,
  getRandomMessage,
} from '../../utils/aiPersonality';
import type { ChatMessage } from './types';

/** Phase-based AI processing stages shown while waiting for stream */
const AI_PHASES = [
  { label: 'Kontext laden...', icon: '🧠', delay: 0 },
  { label: 'Erinnerungen durchsuchen...', icon: '📚', delay: 2000 },
  { label: 'Zusammenhaenge analysieren...', icon: '🔗', delay: 5000 },
  { label: 'Antwort formulieren...', icon: '✍️', delay: 8000 },
];

function useAIPhase(active: boolean) {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }
    // Schedule phase transitions
    timersRef.current = AI_PHASES.slice(1).map((p, i) =>
      setTimeout(() => setPhase(i + 1), p.delay),
    );
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [active]);

  return active ? AI_PHASES[phase] : AI_PHASES[0];
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  thinkingContent: string;
  sending: boolean;
  renderContent: (content: string, messageId?: string) => React.ReactNode;
  messagesEndRef: RefObject<HTMLDivElement>;
  onStopGenerating?: () => void;
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatMessageList({
  messages,
  isStreaming,
  streamingContent,
  thinkingContent,
  sending,
  renderContent,
  messagesEndRef,
  onStopGenerating,
}: ChatMessageListProps) {
  // Phase-based AI status messages
  const aiPhase = useAIPhase(sending && !isStreaming);

  // Stabilize thinking message to prevent flickering on every re-render
  const thinkingMessageRef = useRef<string>('');
  useEffect(() => {
    if (sending && !isStreaming) {
      thinkingMessageRef.current = getRandomMessage('thinking');
    }
  }, [sending, isStreaming]);


  return (
    <div className="chat-messages" role="log" aria-label="Chat-Nachrichten">
      {messages.length === 0 ? (
        <div className="chat-empty neuro-empty-state neuro-human-fade-in" role="status" aria-label="Leerer Chat - Beginne eine Unterhaltung">
          <div className="chat-empty-avatar neuro-breathing" aria-hidden="true">{AI_AVATAR.emoji}</div>
          <h3 className="chat-empty-title neuro-empty-title">{EMPTY_STATE_MESSAGES.chat.title}</h3>
          <p className="chat-empty-description neuro-empty-description">{EMPTY_STATE_MESSAGES.chat.description}</p>
          <span className="chat-empty-hint neuro-empty-encouragement">{EMPTY_STATE_MESSAGES.chat.encouragement}</span>
          <div className="chat-empty-name">
            <span>Ich bin {AI_PERSONALITY.name}</span>
          </div>
        </div>
      ) : (
        <>
          {messages.map(message => (
            <div
              key={message.id}
              className={`chat-message ${message.role} neuro-human-fade-in`}
              role="article"
              aria-label={`Nachricht von ${message.role === 'assistant' ? AI_PERSONALITY.name : 'Dir'}`}
            >
              <div className="chat-message-avatar" title={message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'} aria-hidden="true">
                {message.role === 'assistant' ? AI_AVATAR.emoji : '\u{1F464}'}
              </div>
              <div className="chat-message-content">
                <div className="chat-message-header">
                  <span className="chat-message-name">
                    {message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'}
                  </span>
                  <span className="chat-message-time">{formatTime(message.createdAt)}</span>
                </div>
                <div className="chat-message-text">
                  {renderContent(message.content, message.id)}
                </div>
              </div>
            </div>
          ))}
          {/* Streaming response - shows content as it arrives (including empty state while waiting for first delta) */}
          {isStreaming && (
            <div className="chat-message assistant neuro-human-fade-in streaming" role="status" aria-live="polite">
              <div className="chat-message-avatar" title={AI_PERSONALITY.name} aria-hidden="true">{AI_AVATAR.emoji}</div>
              <div className="chat-message-content">
                <div className="chat-message-header">
                  <span className="chat-message-name">{AI_PERSONALITY.name}</span>
                  <span className="chat-message-status streaming-indicator">schreibt...</span>
                </div>
                {thinkingContent && (
                  <div className="chat-thinking-block" aria-label="KI denkt nach">
                    <span className="thinking-label">Denke nach...</span>
                    <span className="thinking-preview">{thinkingContent.length > 100 ? `${thinkingContent.slice(0, 100)}...` : thinkingContent}</span>
                  </div>
                )}
                <div className="chat-message-text">
                  {streamingContent ? renderContent(streamingContent) : null}
                  <span className="streaming-cursor" aria-hidden="true">{'\u258B'}</span>
                </div>
              </div>
            </div>
          )}
          {/* Phase-based AI processing indicator */}
          {sending && !isStreaming && (
            <div className="chat-message assistant neuro-human-fade-in" role="status" aria-live="polite">
              <div className="chat-message-avatar neuro-breathing" title={AI_PERSONALITY.name} aria-hidden="true">{AI_AVATAR.thinkingEmoji}</div>
              <div className="chat-message-content">
                <div className="chat-message-header">
                  <span className="chat-message-name">{AI_PERSONALITY.name}</span>
                  <span className="chat-message-status ai-phase-label">
                    <span className="ai-phase-icon" aria-hidden="true">{aiPhase.icon}</span>
                    {aiPhase.label}
                  </span>
                </div>
                <div className="typing-indicator neuro-typing" aria-label={aiPhase.label}>
                  <span className="neuro-typing-dot"></span>
                  <span className="neuro-typing-dot"></span>
                  <span className="neuro-typing-dot"></span>
                </div>
              </div>
            </div>
          )}
          {/* Stop generating button */}
          {(isStreaming || (sending && !isStreaming)) && onStopGenerating && (
            <div className="chat-stop-generating">
              <button
                type="button"
                className="chat-stop-btn neuro-focus-ring"
                onClick={onStopGenerating}
                aria-label="Generierung stoppen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                Stoppen
              </button>
            </div>
          )}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}
