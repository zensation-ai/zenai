import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './MobileNav.css';

interface NavItem {
  label: string;
  icon: string;
  page: string;
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

/**
 * Mobile Navigation Component
 * Hamburger menu with slide-out drawer for mobile devices
 */
export function MobileNav({
  currentPage,
  onNavigate,
  archivedCount,
  navGroups
}: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  return (
    <>
      {/* Hamburger Button */}
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
      </button>

      {/* Drawer Portal */}
      {createPortal(
        <>
          {/* Backdrop */}
          <div
            className={`mobile-nav-backdrop ${isOpen ? 'visible' : ''}`}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <nav
            ref={drawerRef}
            id="mobile-nav-drawer"
            className={`mobile-nav-drawer ${isOpen ? 'open' : ''}`}
            role="navigation"
            aria-label="Hauptnavigation"
          >
            <div className="mobile-nav-header">
              <span className="mobile-nav-title">Navigation</span>
              <button
                type="button"
                className="mobile-nav-close"
                onClick={() => setIsOpen(false)}
                aria-label="Menü schließen"
              >
                ×
              </button>
            </div>

            <div className="mobile-nav-content">
              {/* Main Navigation */}
              <div className="mobile-nav-section">
                <button
                  type="button"
                  className={`mobile-nav-item ${currentPage === 'ideas' ? 'active' : ''}`}
                  onClick={() => handleNavigate('ideas')}
                >
                  <span className="nav-item-icon">💭</span>
                  <span className="nav-item-label">Gedanken</span>
                </button>

                <button
                  type="button"
                  className={`mobile-nav-item ${currentPage === 'archive' ? 'active' : ''}`}
                  onClick={() => handleNavigate('archive')}
                >
                  <span className="nav-item-icon">📥</span>
                  <span className="nav-item-label">Archiv</span>
                  {archivedCount > 0 && (
                    <span className="nav-item-badge">{archivedCount}</span>
                  )}
                </button>
              </div>

              {/* Nav Groups */}
              {navGroups.map((group) => (
                <div key={group.label} className="mobile-nav-section">
                  <h3 className="mobile-nav-section-title">
                    <span>{group.icon}</span> {group.label}
                  </h3>
                  {group.items.map((item) => (
                    <button
                      key={item.page}
                      type="button"
                      className={`mobile-nav-item ${currentPage === item.page ? 'active' : ''}`}
                      onClick={() => handleNavigate(item.page)}
                    >
                      <span className="nav-item-icon">{item.icon}</span>
                      <span className="nav-item-label">{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </nav>
        </>,
        document.body
      )}
    </>
  );
}
