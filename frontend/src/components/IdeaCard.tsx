import { useState, memo } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { AIFeedback } from './AIFeedback';
import { InlineLoader } from './SkeletonLoader';
import { useNeuroFeedback } from './NeuroFeedback';
import { getTypeIcon, IDEA_CATEGORIES, PRIORITIES } from '../constants/ideaTypes';
import { formatDate } from '../utils/dateUtils';
import '../neurodesign.css';
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

function IdeaCardComponent({ idea, onDelete, onArchive, onRestore, isArchived = false, context = 'personal' }: IdeaCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const confirm = useConfirm();
  const { triggerSuccess } = useNeuroFeedback();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await confirm({
      title: 'Gedanke löschen',
      message: 'Möchtest du diese Idee wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmText: 'Löschen',
      cancelText: 'Abbrechen',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await axios.delete(`/api/ideas/${idea.id}`);
      onDelete?.(idea.id);
      showToast('Gedanke gelöscht', 'success');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string })?.error || 'Löschen fehlgeschlagen'
        : 'Löschen fehlgeschlagen';
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
      // Neuro-optimiertes Feedback
      triggerSuccess('Archiviert!');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string })?.error || 'Archivierung fehlgeschlagen'
        : 'Archivierung fehlgeschlagen';
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
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string })?.error || 'Wiederherstellung fehlgeschlagen'
        : 'Wiederherstellung fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div
      className={`idea-card liquid-glass neuro-hover-lift neuro-press-effect ${isDeleting ? 'deleting' : ''}`}
      role="article"
      aria-label={`${idea.type}: ${idea.title}`}
    >
      <div className="idea-header">
        <span className="idea-type">{getTypeIcon(idea.type)}</span>
        <h3 className="idea-title">{idea.title}</h3>
        <div className="idea-actions">
          {isArchived ? (
            <button
              type="button"
              className="restore-button neuro-press-effect neuro-focus-ring neuro-anticipate"
              data-anticipate="Wiederherstellen"
              onClick={handleRestore}
              disabled={isArchiving}
              title="Wiederherstellen"
              aria-label="Gedanke wiederherstellen"
            >
              {isArchiving ? <InlineLoader size="small" color="muted" /> : '↩'}
            </button>
          ) : (
            <button
              type="button"
              className="archive-button neuro-press-effect neuro-focus-ring neuro-anticipate"
              data-anticipate="Archivieren"
              onClick={handleArchive}
              disabled={isArchiving}
              title="Archivieren"
              aria-label="Gedanke archivieren"
            >
              {isArchiving ? <InlineLoader size="small" color="muted" /> : '📥'}
            </button>
          )}
          <button
            type="button"
            className="delete-button neuro-press-effect neuro-focus-ring neuro-anticipate"
            data-anticipate="Löschen"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Löschen"
            aria-label="Gedanke löschen"
          >
            {isDeleting ? <InlineLoader size="small" color="muted" /> : '×'}
          </button>
        </div>
      </div>

      <p className="idea-summary">{idea.summary}</p>

      <div className="idea-meta">
        <span className={`idea-category category-${idea.category}`}>
          {IDEA_CATEGORIES[idea.category]?.label || idea.category}
        </span>
        <span className={`idea-priority priority-${idea.priority}`}>
          {PRIORITIES[idea.priority]?.label || idea.priority}
        </span>
        {idea.similarity !== undefined && (
          <span className="idea-similarity">
            {Math.round(idea.similarity * 100)}% Match
          </span>
        )}
      </div>

      {idea.next_steps && idea.next_steps.length > 0 && (
        <div className="idea-steps">
          <strong id={`steps-label-${idea.id}`}>Nächste Schritte:</strong>
          <ul aria-labelledby={`steps-label-${idea.id}`}>
            {idea.next_steps.slice(0, 3).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      {idea.keywords && idea.keywords.length > 0 && (
        <div className="idea-keywords" role="list" aria-label="Keywords">
          {idea.keywords.map((kw, i) => (
            <span key={i} className="keyword" role="listitem">
              {kw}
            </span>
          ))}
        </div>
      )}

      <div className="idea-footer">
        <span className="idea-date">{formatDate(idea.created_at)}</span>
        <AIFeedback
          responseType="idea_structuring"
          originalResponse={`${idea.title}: ${idea.summary}`}
          context={context}
          compact
        />
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent updates
export const IdeaCard = memo(IdeaCardComponent);
