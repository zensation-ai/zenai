/**
 * AdaptiveResult — Renders AI response as a typed surface (Phase 104)
 *
 * Instead of rendering all AI responses as plain text bubbles,
 * AdaptiveResult matches content type and renders appropriate UI:
 * task cards, code blocks, event cards, tables, etc.
 *
 * This is the MVP version. Additional types (email_composer, agent_progress,
 * table, expandable_cards) will be added in later phases.
 */

import { useCallback, useState } from 'react';
import { Calendar, Copy, Check } from 'lucide-react';
import type { AdaptiveResultType } from './types';

interface AdaptiveResultProps {
  type: AdaptiveResultType;
  content: string;
  metadata?: Record<string, unknown>;
}

function TextResult({ content }: { content: string }) {
  return <div className="adaptive-result adaptive-result--text"><p>{content}</p></div>;
}

function TaskCardResult({ content, metadata }: { content: string; metadata?: Record<string, unknown> }) {
  const [done, setDone] = useState(false);
  return (
    <div className={`adaptive-result adaptive-result--task ${done ? 'adaptive-result--task-done' : ''}`}>
      <input
        type="checkbox"
        checked={done}
        onChange={() => setDone(!done)}
        aria-label={`Aufgabe erledigt: ${content}`}
      />
      <div className="adaptive-result__task-body">
        <span className={`adaptive-result__task-title ${done ? 'adaptive-result__task-title--done' : ''}`}>
          {content}
        </span>
        {metadata?.due && (
          <span className="adaptive-result__task-due">{String(metadata.due)}</span>
        )}
      </div>
      {metadata?.priority === 'high' && (
        <span className="adaptive-result__task-priority" aria-label="Hohe Prioritaet">!</span>
      )}
    </div>
  );
}

function CodeBlockResult({ content, metadata }: { content: string; metadata?: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const language = String(metadata?.language ?? '');

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div className="adaptive-result adaptive-result--code">
      <div className="adaptive-result__code-header">
        <span className="adaptive-result__code-lang">{language}</span>
        <button
          className="adaptive-result__code-copy"
          onClick={handleCopy}
          aria-label="Code kopieren"
          type="button"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="adaptive-result__code-content"><code>{content}</code></pre>
    </div>
  );
}

function EventCardResult({ content, metadata }: { content: string; metadata?: Record<string, unknown> }) {
  return (
    <div className="adaptive-result adaptive-result--event">
      <Calendar size={18} className="adaptive-result__event-icon" />
      <div className="adaptive-result__event-body">
        <span className="adaptive-result__event-title">{content}</span>
        <span className="adaptive-result__event-time">
          {metadata?.date ? String(metadata.date) : ''} {metadata?.time ? String(metadata.time) : ''}
        </span>
      </div>
    </div>
  );
}

export function AdaptiveResult({ type, content, metadata }: AdaptiveResultProps) {
  switch (type) {
    case 'task_card':
      return <TaskCardResult content={content} metadata={metadata} />;
    case 'code_block':
      return <CodeBlockResult content={content} metadata={metadata} />;
    case 'event_card':
      return <EventCardResult content={content} metadata={metadata} />;
    case 'text':
    default:
      return <TextResult content={content} />;
  }
}
