import { useRef, useEffect } from 'react';
import {
  AI_PERSONALITY,
  AI_AVATAR,
  EMPTY_STATE_MESSAGES,
  getRandomMessage,
} from '../utils/aiPersonality';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PersonalizationMessagesProps {
  messages: ChatMessage[];
  sending: boolean;
  categoryLabels: Record<string, { label: string; icon: string }>;
}

export function PersonalizationMessages({ messages, sending, categoryLabels }: PersonalizationMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  if (messages.length === 0 && !sending) {
    return (
      <div className="chat-empty-state neuro-empty-state">
        <div className="empty-avatar neuro-breathing">{AI_AVATAR.emoji}</div>
        <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.personalization.title}</h3>
        <p className="neuro-empty-description">{EMPTY_STATE_MESSAGES.personalization.description}</p>
        <div className="chat-empty-categories">
          {Object.entries(categoryLabels).map(([key, { label, icon }]) => (
            <span key={key} className="chat-empty-category-tag">{icon} {label}</span>
          ))}
        </div>
        <span className="empty-encouragement neuro-motivational">{EMPTY_STATE_MESSAGES.personalization.encouragement}</span>
      </div>
    );
  }

  return (
    <div className="messages-container neuro-flow-list">
      {messages.map(message => (
        <div key={message.id} className={`message ${message.role} neuro-human-fade-in`}>
          <div className="message-avatar" title={message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'}>
            {message.role === 'assistant' ? AI_AVATAR.emoji : '👤'}
          </div>
          <div className="message-content">
            <div className="message-header">
              <span className="message-name">{message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'}</span>
              <span className="message-time">{formatTime(message.timestamp)}</span>
            </div>
            <p>{message.content}</p>
          </div>
        </div>
      ))}
      {sending && (
        <div className="message assistant neuro-human-fade-in">
          <div className="message-avatar" title={AI_PERSONALITY.name}>{AI_AVATAR.thinkingEmoji}</div>
          <div className="message-content">
            <div className="message-header">
              <span className="message-name">{AI_PERSONALITY.name}</span>
              <span className="message-status neuro-motivational">{getRandomMessage('learning')}</span>
            </div>
            <div className="neuro-typing">
              <span className="neuro-typing-dot"></span>
              <span className="neuro-typing-dot"></span>
              <span className="neuro-typing-dot"></span>
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
