/**
 * Progressive Disclosure System
 *
 * Reduziert Cognitive Load durch schrittweise Informationsenthüllung
 *
 * Basierend auf:
 * - Miller's Law (7±2 Items im Arbeitsgedächtnis)
 * - Cognitive Load Theory
 * - Progressive Disclosure Pattern (Nielsen Norman Group)
 */

import { useState, useCallback, type ReactNode, type CSSProperties } from 'react';
import './ProgressiveDisclosure.css';

// ===========================================
// Types
// ===========================================

interface StaggeredListProps {
  children: ReactNode[];
  /** Maximale Anzahl initial sichtbarer Items (Miller's Law: 7) */
  initialVisible?: number;
  /** Verzögerung zwischen Items in ms */
  staggerDelay?: number;
  /** Text für "Mehr anzeigen" Button */
  showMoreText?: string;
  /** Text für "Weniger anzeigen" Button */
  showLessText?: string;
  /** Animationsrichtung */
  direction?: 'vertical' | 'horizontal';
  /** Klasse für den Container */
  className?: string;
}

interface ExpandableSectionProps {
  /** Überschrift/Trigger-Element */
  title: ReactNode;
  /** Inhalt der beim Expandieren angezeigt wird */
  children: ReactNode;
  /** Initial expandiert? */
  defaultExpanded?: boolean;
  /** Icon im Header */
  icon?: string;
  /** Callback bei Änderung */
  onChange?: (expanded: boolean) => void;
  /** Zusätzliche Klassen */
  className?: string;
  /** Preview-Text der im kollabierten Zustand angezeigt wird */
  preview?: string;
}

interface ChunkedContentProps {
  children: ReactNode[];
  /** Items pro Chunk (Miller's Law konform) */
  chunkSize?: number;
  /** Titel für jeden Chunk */
  chunkTitles?: string[];
  /** Container-Klasse */
  className?: string;
}

interface SkipLinkProps {
  /** Ziel-ID */
  targetId: string;
  /** Link-Text */
  children: ReactNode;
}

// ===========================================
// Staggered List Component
// Miller's Law: Zeige max 7 Items initial an
// ===========================================

export const StaggeredList = ({
  children,
  initialVisible = 7,
  staggerDelay = 50,
  showMoreText = 'Mehr anzeigen',
  showLessText = 'Weniger anzeigen',
  direction = 'vertical',
  className = '',
}: StaggeredListProps) => {
  const [showAll, setShowAll] = useState(false);

  const items = children.filter(Boolean);
  const hasMore = items.length > initialVisible;
  const visibleItems = showAll ? items : items.slice(0, initialVisible);

  const toggleShowAll = useCallback(() => {
    setShowAll(prev => !prev);
  }, []);

  return (
    <div className={`staggered-list ${direction} ${className}`}>
      <div className="staggered-list-items">
        {visibleItems.map((child, index) => (
          <div
            key={`stagger-item-${index}`}
            className="staggered-item"
            style={{
              '--stagger-delay': `${index * staggerDelay}ms`,
            } as CSSProperties}
          >
            {child}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          className="staggered-toggle"
          onClick={toggleShowAll}
          aria-expanded={showAll}
        >
          <span className="toggle-icon">{showAll ? '−' : '+'}</span>
          <span className="toggle-text">
            {showAll ? showLessText : `${showMoreText} (${items.length - initialVisible})`}
          </span>
        </button>
      )}

      {/* Cognitive Load Indicator */}
      {items.length > 7 && !showAll && (
        <div className="cognitive-hint" aria-hidden="true">
          <span className="cognitive-icon">🧠</span>
          <span className="cognitive-text">
            {items.length - initialVisible} weitere Items versteckt
          </span>
        </div>
      )}
    </div>
  );
};

// ===========================================
// Expandable Section Component
// Progressive Disclosure für komplexe Inhalte
// ===========================================

export const ExpandableSection = ({
  title,
  children,
  defaultExpanded = false,
  icon,
  onChange,
  className = '',
  preview,
}: ExpandableSectionProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    const newState = !expanded;
    setExpanded(newState);
    onChange?.(newState);
  }, [expanded, onChange]);

  return (
    <div className={`expandable-section ${expanded ? 'expanded' : ''} ${className}`}>
      <button
        type="button"
        className="expandable-header"
        onClick={toggleExpanded}
        aria-expanded={expanded}
      >
        <div className="expandable-title">
          {icon && <span className="expandable-icon">{icon}</span>}
          <span className="expandable-label">{title}</span>
        </div>

        {!expanded && preview && (
          <span className="expandable-preview">{preview}</span>
        )}

        <span className={`expandable-chevron ${expanded ? 'rotated' : ''}`}>
          ›
        </span>
      </button>

      <div
        className="expandable-content"
        aria-hidden={!expanded}
      >
        <div className="expandable-inner">
          {children}
        </div>
      </div>
    </div>
  );
};

// ===========================================
// Chunked Content Component
// Teilt Inhalte in kognitive Chunks
// ===========================================

export const ChunkedContent = ({
  children,
  chunkSize = 5,
  chunkTitles,
  className = '',
}: ChunkedContentProps) => {
  const items = children.filter(Boolean);

  // Teile in Chunks
  const chunks: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  return (
    <div className={`chunked-content ${className}`}>
      {chunks.map((chunk, chunkIndex) => (
        <div key={chunkIndex} className="content-chunk">
          {chunkTitles?.[chunkIndex] && (
            <h4 className="chunk-title">{chunkTitles[chunkIndex]}</h4>
          )}
          <div className="chunk-items">
            {chunk.map((item, itemIndex) => (
              <div
                key={itemIndex}
                className="chunk-item"
                style={{
                  '--chunk-delay': `${itemIndex * 60}ms`,
                } as CSSProperties}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ===========================================
// Information Hierarchy Component
// Strukturierte Info-Darstellung
// ===========================================

interface InfoHierarchyProps {
  /** Primäre Information (immer sichtbar) */
  primary: ReactNode;
  /** Sekundäre Information (bei Bedarf) */
  secondary?: ReactNode;
  /** Tertiäre/Details (on-demand) */
  tertiary?: ReactNode;
  /** Labels */
  labels?: {
    secondary?: string;
    tertiary?: string;
  };
}

export const InfoHierarchy = ({
  primary,
  secondary,
  tertiary,
  labels = { secondary: 'Details', tertiary: 'Mehr erfahren' },
}: InfoHierarchyProps) => {
  const [showSecondary, setShowSecondary] = useState(false);
  const [showTertiary, setShowTertiary] = useState(false);

  return (
    <div className="info-hierarchy">
      {/* Primary - Always Visible */}
      <div className="info-primary">{primary}</div>

      {/* Secondary - On Request */}
      {secondary && (
        <>
          {!showSecondary ? (
            <button
              type="button"
              className="info-reveal-btn secondary"
              onClick={() => setShowSecondary(true)}
            >
              <span className="reveal-icon">+</span>
              {labels.secondary}
            </button>
          ) : (
            <div className="info-secondary animate-in">
              {secondary}
            </div>
          )}
        </>
      )}

      {/* Tertiary - Deep Detail */}
      {tertiary && showSecondary && (
        <>
          {!showTertiary ? (
            <button
              type="button"
              className="info-reveal-btn tertiary"
              onClick={() => setShowTertiary(true)}
            >
              <span className="reveal-icon">+</span>
              {labels.tertiary}
            </button>
          ) : (
            <div className="info-tertiary animate-in">
              {tertiary}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ===========================================
// Skip Link for Keyboard Navigation
// Reduziert kognitive Last für Power-User
// ===========================================

export const SkipLink = ({ targetId, children }: SkipLinkProps) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }, [targetId]);

  return (
    <a
      href={`#${targetId}`}
      className="skip-link"
      onClick={handleClick}
    >
      {children}
    </a>
  );
};

// ===========================================
// Reading Progress Indicator
// Zeigt Fortschritt durch Inhalte
// ===========================================

interface ReadingProgressProps {
  /** Container-Ref oder Selector */
  targetSelector?: string;
}

export const ReadingProgress = ({ targetSelector = 'main' }: ReadingProgressProps) => {
  const [progress, setProgress] = useState(0);

  // Scroll-Handler für Progress
  const handleScroll = useCallback(() => {
    const target = document.querySelector(targetSelector);
    if (!target) return;

    const windowHeight = window.innerHeight;
    const documentHeight = target.scrollHeight;
    const scrollTop = window.scrollY;

    const totalScrollable = documentHeight - windowHeight;
    const currentProgress = totalScrollable > 0
      ? Math.min((scrollTop / totalScrollable) * 100, 100)
      : 0;

    setProgress(currentProgress);
  }, [targetSelector]);

  // Effect für Scroll-Listener
  useState(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });

  return (
    <div
      className="reading-progress"
      style={{ '--progress': `${progress}%` } as CSSProperties}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Lesefortschritt"
    >
      <div className="reading-progress-bar" />
    </div>
  );
};

// ===========================================
// Complexity Indicator
// Warnt bei hoher kognitiver Last
// ===========================================

interface ComplexityIndicatorProps {
  /** Anzahl der Items/Elemente */
  itemCount: number;
  /** Schwellenwerte */
  thresholds?: { low: number; medium: number; high: number };
  /** Labels */
  labels?: { low: string; medium: string; high: string };
}

export const ComplexityIndicator = ({
  itemCount,
  thresholds = { low: 5, medium: 7, high: 10 },
  labels = { low: 'Einfach', medium: 'Moderat', high: 'Komplex' },
}: ComplexityIndicatorProps) => {
  let level: 'low' | 'medium' | 'high';
  let label: string;

  if (itemCount <= thresholds.low) {
    level = 'low';
    label = labels.low;
  } else if (itemCount <= thresholds.medium) {
    level = 'medium';
    label = labels.medium;
  } else {
    level = 'high';
    label = labels.high;
  }

  const barCount = 5;
  const activeBarsFraction = Math.min(itemCount / thresholds.high, 1);
  const activeBars = Math.ceil(activeBarsFraction * barCount);

  return (
    <div
      className={`complexity-indicator level-${level}`}
      title={`${label}: ${itemCount} Elemente`}
      role="meter"
      aria-valuenow={itemCount}
      aria-valuemin={0}
      aria-valuemax={thresholds.high}
      aria-label={`Komplexität: ${label}`}
    >
      <div className="complexity-bars">
        {[...Array(barCount)].map((_, i) => (
          <div
            key={i}
            className={`complexity-bar ${i < activeBars ? 'active' : ''}`}
          />
        ))}
      </div>
      <span className="complexity-label">{label}</span>
    </div>
  );
};
