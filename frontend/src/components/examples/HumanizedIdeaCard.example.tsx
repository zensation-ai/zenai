/**
 * INTEGRATION EXAMPLE: Humanized Idea Card
 *
 * Dieses Beispiel zeigt, wie man die humanisierten UI-Komponenten
 * in einer realen IdeaCard-Komponente integriert.
 *
 * Features demonstriert:
 * - TooltipButton mit Shortcuts
 * - SuccessAnimation bei Aktionen
 * - ContextualLoader beim Speichern
 * - FriendlyError bei Fehlern
 * - useHumanizedFeedback Hook
 * - Skeleton Loading State
 *
 * HINWEIS: Dies ist ein Beispiel - kopiere relevante Teile in deine
 * echten Komponenten und passe sie an.
 */

import { useState, useCallback } from 'react';
import {
  TooltipButton,
  ArchiveButton,
  SaveButton,
  FavoriteButton,
} from '../TooltipButton';
import {
  SuccessAnimation,
  ContextualLoader,
  FriendlyError,
  EnhancedTooltip,
  HumanizedEmptyState,
} from '../HumanizedUI';
import { SkeletonLoader } from '../SkeletonLoader';
import { useHumanizedFeedback } from '../../hooks/useHumanizedFeedback';
import { getRandomPlaceholder } from '../../utils/humanizedMessages';

// ============================================
// TYPES
// ============================================

interface Idea {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  isFavorite: boolean;
  category?: string;
}

interface HumanizedIdeaCardProps {
  idea?: Idea;
  isLoading?: boolean;
  onSave?: (idea: Idea) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onShare?: (id: string) => Promise<void>;
  onFavorite?: (id: string, isFavorite: boolean) => Promise<void>;
}

// ============================================
// COMPONENT
// ============================================

export function HumanizedIdeaCard({
  idea,
  isLoading = false,
  onSave,
  onArchive,
  onDelete,
  onShare,
  onFavorite,
}: HumanizedIdeaCardProps) {
  // Humanized Feedback Hook
  const { triggerActionSuccess } = useHumanizedFeedback();

  // Local State
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAction, setSuccessAction] = useState<'save' | 'archive' | 'share'>('save');
  const [error, setError] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState(idea?.content || '');

  // ============================================
  // HANDLERS
  // ============================================

  const handleSave = useCallback(async () => {
    if (!idea || !onSave) return;

    setIsSaving(true);
    setError(null);

    try {
      await onSave({ ...idea, content: editedContent });

      // Trigger humanized success feedback
      triggerActionSuccess('save', { name: idea.title });
      setSuccessAction('save');
      setShowSuccess(true);
    } catch (err) {
      setError('server');
    } finally {
      setIsSaving(false);
    }
  }, [idea, editedContent, onSave, triggerActionSuccess]);

  const handleArchive = useCallback(async () => {
    if (!idea || !onArchive) return;

    setIsArchiving(true);
    setError(null);

    try {
      await onArchive(idea.id);

      triggerActionSuccess('archive', { name: idea.title });
      setSuccessAction('archive');
      setShowSuccess(true);
    } catch (err) {
      setError('server');
    } finally {
      setIsArchiving(false);
    }
  }, [idea, onArchive, triggerActionSuccess]);

  const handleShare = useCallback(async () => {
    if (!idea || !onShare) return;

    try {
      await onShare(idea.id);

      triggerActionSuccess('share');
      setSuccessAction('share');
      setShowSuccess(true);
    } catch (err) {
      setError('server');
    }
  }, [idea, onShare, triggerActionSuccess]);

  const handleFavorite = useCallback(async () => {
    if (!idea || !onFavorite) return;

    try {
      await onFavorite(idea.id, !idea.isFavorite);
      // Kein großes Success-Feedback für Toggle-Aktionen
    } catch (err) {
      setError('server');
    }
  }, [idea, onFavorite]);

  const handleDelete = useCallback(async () => {
    if (!idea || !onDelete) return;

    // Hier würde normalerweise ein Bestätigungsdialog kommen
    try {
      await onDelete(idea.id);
      triggerActionSuccess('delete');
    } catch (err) {
      setError('server');
    }
  }, [idea, onDelete, triggerActionSuccess]);

  // ============================================
  // LOADING STATE
  // ============================================

  if (isLoading) {
    return (
      <div className="humanized-idea-card loading">
        <div className="card-header">
          <SkeletonLoader type="text" width="60%" />
          <SkeletonLoader type="text" width="80px" />
        </div>
        <div className="card-content">
          <SkeletonLoader type="text" count={3} />
        </div>
        <div className="card-actions">
          <SkeletonLoader type="button" />
          <SkeletonLoader type="button" />
        </div>
      </div>
    );
  }

  // ============================================
  // EMPTY STATE
  // ============================================

  if (!idea) {
    return (
      <HumanizedEmptyState
        type="ideas"
        size="medium"
        onAction={() => {
          // Öffne neuen Ideen-Dialog
        }}
      />
    );
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="humanized-idea-card liquid-glass">
      {/* Error Banner */}
      {error && (
        <FriendlyError
          errorType={error as 'server' | 'network'}
          variant="inline"
          onRetry={() => setError(null)}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Card Header */}
      <div className="card-header">
        <EnhancedTooltip
          content={{
            label: idea.title,
            action: 'Klicken zum Bearbeiten',
            hint: 'Der Titel wird automatisch aus dem Inhalt generiert',
          }}
        >
          <h3 className="card-title">{idea.title}</h3>
        </EnhancedTooltip>

        <span className="card-date">
          {idea.createdAt.toLocaleDateString('de-DE', {
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>

      {/* Card Content */}
      <div className="card-content">
        {isSaving ? (
          <ContextualLoader
            context={{ type: 'save', itemName: idea.title }}
            size="small"
            inline
          />
        ) : (
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            placeholder={getRandomPlaceholder('ideaInput')}
            className="card-textarea neuro-placeholder-animated"
          />
        )}
      </div>

      {/* Card Actions */}
      <div className="card-actions">
        <div className="actions-left">
          <FavoriteButton
            isFavorite={idea.isFavorite}
            onClick={handleFavorite}
            aria-label={idea.isFavorite ? 'Von Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          >
            {idea.isFavorite ? 'Favorit' : 'Merken'}
          </FavoriteButton>
        </div>

        <div className="actions-right">
          <TooltipButton
            tooltipId="shareIdea"
            onClick={handleShare}
            variant="ghost"
            size="small"
            icon="📤"
          >
            Teilen
          </TooltipButton>

          <ArchiveButton
            onClick={handleArchive}
            loading={isArchiving}
            size="small"
          >
            Archiv
          </ArchiveButton>

          <SaveButton
            onClick={handleSave}
            loading={isSaving}
            disabled={editedContent === idea.content}
            size="small"
          >
            Speichern
          </SaveButton>

          <TooltipButton
            tooltipId="deleteIdea"
            onClick={handleDelete}
            variant="ghost"
            size="small"
            icon="🗑️"
          >
            Löschen
          </TooltipButton>
        </div>
      </div>

      {/* Success Animation */}
      <SuccessAnimation
        show={showSuccess}
        action={successAction}
        onComplete={() => setShowSuccess(false)}
        position="toast"
      />
    </div>
  );
}

// ============================================
// USAGE EXAMPLE
// ============================================

/*
STYLES (add to your CSS file):

.humanized-idea-card {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.humanized-idea-card.loading {
  min-height: 200px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  cursor: pointer;
}

.card-title:hover {
  color: var(--neuro-reward);
}

.card-date {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.card-content {
  flex: 1;
}

.card-textarea {
  width: 100%;
  min-height: 100px;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.5;
}

.card-textarea:focus {
  outline: none;
  border-color: var(--neuro-reward);
  box-shadow: 0 0 0 3px var(--neuro-reward-pulse);
}

.card-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.actions-left,
.actions-right {
  display: flex;
  gap: 0.5rem;
}
*/

/*
// In deiner App:

import { HumanizedIdeaCard } from './components/examples/HumanizedIdeaCard.example';

function MyIdeasPage() {
  const [idea, setIdea] = useState<Idea>({
    id: '1',
    title: 'Meine erste Idee',
    content: 'Das ist der Inhalt meiner Idee...',
    createdAt: new Date(),
    isFavorite: false,
  });

  return (
    <HumanizedIdeaCard
      idea={idea}
      onSave={async (updatedIdea) => {
        // API call
        setIdea(updatedIdea);
      }}
      onArchive={async (id) => {
        // API call
      }}
      onDelete={async (id) => {
        // API call
      }}
      onShare={async (id) => {
        // API call
      }}
      onFavorite={async (id, isFavorite) => {
        // API call
        setIdea(prev => ({ ...prev, isFavorite }));
      }}
    />
  );
}
*/

export default HumanizedIdeaCard;
