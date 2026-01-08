import { useState } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './IdeaCard.css';

interface Idea {
  id: string;
  title: string;
  type: 'idea' | 'task' | 'insight' | 'problem' | 'question';
  category: 'business' | 'technical' | 'personal' | 'learning';
  priority: 'low' | 'medium' | 'high';
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  created_at: string;
  similarity?: number;
}

interface IdeaCardProps {
  idea: Idea;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  isArchived?: boolean;
  context?: 'personal' | 'work';
}

const typeIcons: Record<string, string> = {
  idea: '💡',
  task: '✅',
  insight: '🔍',
  problem: '⚠️',
  question: '❓',
};

export function IdeaCard({ idea, onDelete, onArchive, onRestore, isArchived = false, context = 'personal' }: IdeaCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Möchtest du diese Idee wirklich löschen?')) return;

    setIsDeleting(true);
    try {
      await axios.delete(`/api/ideas/${idea.id}`);
      onDelete?.(idea.id);
      showToast('Gedanke gelöscht', 'success');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Löschen fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsArchiving(true);
    try {
      await axios.put(`/api/${context}/ideas/${idea.id}/archive`);
      onArchive?.(idea.id);
      showToast('Gedanke archiviert', 'success');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Archivierung fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsArchiving(true);
    try {
      await axios.put(`/api/${context}/ideas/${idea.id}/restore`);
      onRestore?.(idea.id);
      showToast('Gedanke wiederhergestellt', 'success');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Wiederherstellung fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`idea-card ${isDeleting ? 'deleting' : ''}`}>
      <div className="idea-header">
        <span className="idea-type">{typeIcons[idea.type] || '📝'}</span>
        <h3 className="idea-title">{idea.title}</h3>
        <div className="idea-actions">
          {isArchived ? (
            <button
              type="button"
              className="restore-button"
              onClick={handleRestore}
              disabled={isArchiving}
              title="Wiederherstellen"
              aria-label="Gedanke wiederherstellen"
            >
              {isArchiving ? '...' : '↩'}
            </button>
          ) : (
            <button
              type="button"
              className="archive-button"
              onClick={handleArchive}
              disabled={isArchiving}
              title="Archivieren"
              aria-label="Gedanke archivieren"
            >
              {isArchiving ? '...' : '📥'}
            </button>
          )}
          <button
            type="button"
            className="delete-button"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Löschen"
            aria-label="Gedanke löschen"
          >
            {isDeleting ? '...' : '×'}
          </button>
        </div>
      </div>

      <p className="idea-summary">{idea.summary}</p>

      <div className="idea-meta">
        <span className={`idea-category category-${idea.category}`}>
          {idea.category}
        </span>
        <span className={`idea-priority priority-${idea.priority}`}>
          {idea.priority}
        </span>
        {idea.similarity !== undefined && (
          <span className="idea-similarity">
            {Math.round(idea.similarity * 100)}% Match
          </span>
        )}
      </div>

      {idea.next_steps && idea.next_steps.length > 0 && (
        <div className="idea-steps">
          <strong>Nächste Schritte:</strong>
          <ul>
            {idea.next_steps.slice(0, 3).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      {idea.keywords && idea.keywords.length > 0 && (
        <div className="idea-keywords">
          {idea.keywords.map((kw, i) => (
            <span key={i} className="keyword">
              {kw}
            </span>
          ))}
        </div>
      )}

      <div className="idea-footer">
        <span className="idea-date">{formatDate(idea.created_at)}</span>
      </div>
    </div>
  );
}
