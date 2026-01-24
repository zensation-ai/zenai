/**
 * NavDropdown Component - Neuro-optimiert
 *
 * Neurowissenschaftliche Optimierungen:
 * - Staggered Reveal (Progressive Disclosure)
 * - Anticipatory Hover Effects
 * - Miller's Law: Max 7 Items pro Gruppe
 * - Dopamin-aktivierende Micro-Interactions
 * - Cognitive Load Management durch Gruppierung
 */

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import './NavDropdown.css';

export interface NavDropdownItem {
  label: string;
  icon: string;
  page: string;
  description?: string; // Für Anticipatory Tooltips
  group?: string; // Für Gruppierung bei vielen Items
}

interface NavDropdownProps {
  label: string;
  icon: string;
  items: NavDropdownItem[];
  currentPage: string;
  onNavigate: (page: string) => void;
  /** Zeige Gruppierung wenn Items > 5 */
  showGrouping?: boolean;
}

// Stagger-Delay für Progressive Disclosure
const STAGGER_DELAY = 35; // ms pro Item
const HOVER_INTENT_DELAY = 80; // ms für Hover-Intent Detection

export function NavDropdown({
  label,
  icon,
  items,
  currentPage,
  onNavigate,
  showGrouping = true,
}: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [hoverIntent, setHoverIntent] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if any child item is active
  const hasActiveChild = items.some(item => item.page === currentPage);

  // Gruppiere Items wenn nötig (Miller's Law)
  const groupedItems = useCallback(() => {
    if (!showGrouping || items.length <= 5) {
      return [{ group: null, items }];
    }

    // Gruppiere nach group-Property oder erstelle automatische Chunks
    const groups: Map<string | null, NavDropdownItem[]> = new Map();

    items.forEach(item => {
      const groupKey = item.group || null;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(item);
    });

    return Array.from(groups.entries()).map(([group, groupItems]) => ({
      group,
      items: groupItems,
    }));
  }, [items, showGrouping]);

  // Hover Intent Detection - Reduziert False Positives
  const handleTriggerMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverIntent(true);
    }, HOVER_INTENT_DELAY);
  }, []);

  const handleTriggerMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoverIntent(false);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Cleanup hover timeout
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleItemClick = (page: string) => {
    onNavigate(page);
    setIsOpen(false);
  };

  const handleItemHover = (page: string | null) => {
    setHoveredItem(page);
  };

  // Cognitive Load Indicator
  const getCognitiveLoad = () => {
    if (items.length <= 4) return 'low';
    if (items.length <= 7) return 'medium';
    return 'high';
  };

  const grouped = groupedItems();
  let globalIndex = 0;

  return (
    <div
      className={`nav-dropdown ${hoverIntent ? 'hover-intent' : ''}`}
      ref={dropdownRef}
      onMouseEnter={handleTriggerMouseEnter}
      onMouseLeave={handleTriggerMouseLeave}
    >
      <button
        type="button"
        className={`nav-dropdown-trigger ${hasActiveChild ? 'has-active' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="nav-dropdown-icon">{icon}</span>
        <span className="nav-dropdown-label">{label}</span>
        <span className={`nav-dropdown-chevron ${isOpen ? 'rotated' : ''}`}>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        {/* Ripple-Container für Micro-Interaction */}
        <span className="trigger-ripple" />
      </button>

      {/* Anticipatory Tooltip bei Hover Intent */}
      {hoverIntent && !isOpen && (
        <div className="nav-dropdown-preview" role="tooltip">
          <span className="preview-count">{items.length} Optionen</span>
          {getCognitiveLoad() === 'high' && (
            <span className="preview-hint">In Gruppen organisiert</span>
          )}
        </div>
      )}

      {isOpen && (
        <div
          className={`nav-dropdown-menu cognitive-${getCognitiveLoad()}`}
          role="menu"
        >
          {/* Cognitive Load Indicator für komplexe Menüs */}
          {items.length > 5 && (
            <div className="menu-cognitive-indicator" aria-hidden="true">
              <div className="cognitive-bars">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`cognitive-bar ${i < Math.ceil((items.length / 10) * 5) ? 'active' : ''}`}
                  />
                ))}
              </div>
              <span className="cognitive-label">
                {items.length} Items
              </span>
            </div>
          )}

          {grouped.map((group, groupIndex) => (
            <div key={groupIndex} className="menu-group">
              {group.group && (
                <div className="menu-group-title">{group.group}</div>
              )}
              {group.items.map((item) => {
                const itemIndex = globalIndex++;
                const isHovered = hoveredItem === item.page;
                const isActive = currentPage === item.page;

                return (
                  <button
                    key={item.page}
                    type="button"
                    className={`nav-dropdown-item ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
                    onClick={() => handleItemClick(item.page)}
                    onMouseEnter={() => handleItemHover(item.page)}
                    onMouseLeave={() => handleItemHover(null)}
                    role="menuitem"
                    style={{
                      '--stagger-delay': `${itemIndex * STAGGER_DELAY}ms`,
                    } as CSSProperties}
                  >
                    <span className="item-icon">{item.icon}</span>
                    <div className="item-content">
                      <span className="item-label">{item.label}</span>
                      {item.description && isHovered && (
                        <span className="item-description">{item.description}</span>
                      )}
                    </div>
                    {isActive && (
                      <span className="item-active-indicator" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                    {/* Hover Glow Effect */}
                    <span className="item-glow" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
