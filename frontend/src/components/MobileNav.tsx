/**
 * Mobile Navigation Component - Neuro-optimiert
 *
 * Neurowissenschaftliche Optimierungen:
 * - Staggered Reveal für Progressive Disclosure
 * - Liquid Glass 2026 Design
 * - Cognitive Load durch Gruppierung reduziert
 * - Dopamin-aktivierende Micro-Interactions
 * - Miller's Law: Max 7 Items pro Sektion
 */

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import '../neurodesign.css';
import './MobileNav.css';

interface NavItem {
  label: string;
  icon: string;
  page: string;
  description?: string;
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

interface MobileNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  archivedCount: number;
  navGroups: NavGroup[];
}

// Animation timing constants
const STAGGER_DELAY = 40; // ms pro Item
const GROUP_DELAY = 80; // Extra Delay zwischen Gruppen

/**
 * Mobile Navigation Component
 * Hamburger menu with slide-out drawer for mobile devices
 * Neuro-optimiert für bessere UX
 */
export function MobileNav({
  currentPage,
  onNavigate,
  archivedCount,
  navGroups
}: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close drawer on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus trap within drawer
  useEffect(() => {
    if (!isOpen || !drawerRef.current) return;

    const focusableElements = drawerRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    firstElement?.focus();
    document.addEventListener('keydown', handleTab);

    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  const handleNavigate = (page: string) => {
    onNavigate(page);
    setIsOpen(false);
  };

  const toggleGroup = (groupLabel: string) => {
    setActiveGroup(prev => prev === groupLabel ? null : groupLabel);
  };

  // Calculate total items for cognitive load indicator
  const totalItems = 4 + navGroups.reduce((sum, g) => sum + g.items.length, 0);
  const cognitiveLevel = totalItems <= 10 ? 'low' : totalItems <= 15 ? 'medium' : 'high';

  // Main navigation items
  const mainNavItems: NavItem[] = [
    { label: 'Dashboard', icon: '📊', page: 'dashboard' },
    { label: 'Gedanken', icon: '💭', page: 'ideas' },
    { label: 'Triage', icon: '📋', page: 'triage' },
    { label: 'Archiv', icon: '📥', page: 'archive' },
  ];

  let globalIndex = 0;

  return (
    <>
      {/* Hamburger Button with Micro-Interaction */}
      <button
        type="button"
        className={`mobile-nav-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-drawer"
        aria-label={isOpen ? 'Menü schließen' : 'Menü öffnen'}
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-ripple" />
      </button>

      {/* Drawer Portal */}
      {createPortal(
        <>
          {/* Backdrop with Blur */}
          <div
            className={`mobile-nav-backdrop ${isOpen ? 'visible' : ''}`}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer - Liquid Glass Design */}
          <nav
            ref={drawerRef}
            id="mobile-nav-drawer"
            className={`mobile-nav-drawer liquid-glass-nav ${isOpen ? 'open' : ''} cognitive-${cognitiveLevel}`}
            role="navigation"
            aria-label="Hauptnavigation"
          >
            {/* Header */}
            <div className="mobile-nav-header">
              <div className="mobile-nav-title-area">
                <span className="mobile-nav-logo">🧠</span>
                <span className="mobile-nav-title">Navigation</span>
              </div>
              <button
                type="button"
                className="mobile-nav-close"
                onClick={() => setIsOpen(false)}
                aria-label="Menü schließen"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Cognitive Load Indicator */}
            {totalItems > 12 && (
              <div className="mobile-nav-cognitive" aria-hidden="true">
                <div className="cognitive-bars-mobile">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`cognitive-bar-mobile ${i < Math.ceil((totalItems / 20) * 5) ? 'active' : ''}`}
                    />
                  ))}
                </div>
                <span className="cognitive-text">{totalItems} Optionen verfügbar</span>
              </div>
            )}

            <div className="mobile-nav-content">
              {/* Main Navigation - Staggered Reveal */}
              <div className="mobile-nav-section mobile-nav-main">
                {mainNavItems.map((item) => {
                  const itemIndex = globalIndex++;
                  const isActive = currentPage === item.page;

                  return (
                    <button
                      key={item.page}
                      type="button"
                      className={`mobile-nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleNavigate(item.page)}
                      style={{
                        '--stagger-delay': `${itemIndex * STAGGER_DELAY}ms`,
                      } as CSSProperties}
                    >
                      <span className="nav-item-icon">{item.icon}</span>
                      <span className="nav-item-label">{item.label}</span>
                      {item.page === 'archive' && archivedCount > 0 && (
                        <span className="nav-item-badge">{archivedCount}</span>
                      )}
                      {isActive && (
                        <span className="nav-item-active-dot" aria-hidden="true" />
                      )}
                      <span className="nav-item-glow" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>

              {/* Nav Groups - Collapsible with Staggered Items */}
              {navGroups.map((group, groupIndex) => {
                const isGroupActive = activeGroup === group.label;
                const hasActiveChild = group.items.some(item => item.page === currentPage);

                return (
                  <div
                    key={group.label}
                    className={`mobile-nav-section mobile-nav-group ${isGroupActive ? 'expanded' : ''} ${hasActiveChild ? 'has-active' : ''}`}
                    style={{
                      '--group-delay': `${(groupIndex + 1) * GROUP_DELAY}ms`,
                    } as CSSProperties}
                  >
                    {/* Group Header - Collapsible */}
                    <button
                      type="button"
                      className="mobile-nav-group-header"
                      onClick={() => toggleGroup(group.label)}
                      aria-expanded={isGroupActive}
                    >
                      <span className="group-icon">{group.icon}</span>
                      <span className="group-label">{group.label}</span>
                      <span className="group-count">{group.items.length}</span>
                      <span className={`group-chevron ${isGroupActive ? 'rotated' : ''}`}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    </button>

                    {/* Group Items - Progressive Disclosure */}
                    <div className={`mobile-nav-group-items ${isGroupActive ? 'visible' : ''}`}>
                      {group.items.map((item, itemIndex) => {
                        globalIndex++;
                        const isActive = currentPage === item.page;

                        return (
                          <button
                            key={item.page}
                            type="button"
                            className={`mobile-nav-item nested ${isActive ? 'active' : ''}`}
                            onClick={() => handleNavigate(item.page)}
                            style={{
                              '--item-delay': `${itemIndex * STAGGER_DELAY}ms`,
                            } as CSSProperties}
                          >
                            <span className="nav-item-icon">{item.icon}</span>
                            <span className="nav-item-label">{item.label}</span>
                            {isActive && (
                              <span className="nav-item-checkmark" aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                                  <path d="M11.5 4L5.5 10 2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            )}
                            <span className="nav-item-glow" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer with Quick Actions */}
            <div className="mobile-nav-footer">
              <div className="mobile-nav-hint">
                <span className="hint-icon">💡</span>
                <span className="hint-text">Wische nach rechts zum Schließen</span>
              </div>
            </div>
          </nav>
        </>,
        document.body
      )}
    </>
  );
}
