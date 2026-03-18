/**
 * QueryErrorState - Reusable inline error recovery component
 *
 * Uses the design system EmptyState + error utility for consistent
 * error display with retry capabilities across all pages.
 */

import { AlertTriangle } from 'lucide-react';
import { EmptyState, Button } from '../design-system';
import { categorizeError, getErrorContent } from '../utils/errors';

export interface QueryErrorStateProps {
  /** The error object (from React Query or catch blocks) */
  error: Error | unknown;
  /** Retry callback (typically queryClient refetch) */
  refetch?: () => void;
  /** Optional className for wrapper */
  className?: string;
}

export function QueryErrorState({ error, refetch, className }: QueryErrorStateProps) {
  const category = categorizeError(error);
  const content = getErrorContent(category);

  return (
    <EmptyState
      className={className}
      icon={<AlertTriangle size={40} strokeWidth={1.5} />}
      title={content.title}
      description={`${content.description} ${content.suggestion}`}
      action={
        content.canRetry && refetch ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
          >
            Erneut versuchen
          </Button>
        ) : undefined
      }
    />
  );
}
