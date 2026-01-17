import { useState, useEffect, useRef } from 'react';

export interface NavDropdownItem {
  label: string;
  icon: string;
  page: string;
}

interface NavDropdownProps {
  label: string;
  icon: string;
  items: NavDropdownItem[];
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function NavDropdown({ label, icon, items, currentPage, onNavigate }: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if any child item is active
  const hasActiveChild = items.some(item => item.page === currentPage);

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

  const handleItemClick = (page: string) => {
    onNavigate(page);
    setIsOpen(false);
  };

  return (
    <div className="nav-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className={`nav-dropdown-trigger ${hasActiveChild ? 'has-active' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="nav-dropdown-icon">{icon}</span>
        <span className="nav-dropdown-label">{label}</span>
        <span className="nav-dropdown-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="nav-dropdown-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`nav-dropdown-item ${currentPage === item.page ? 'active' : ''}`}
              onClick={() => handleItemClick(item.page)}
              role="menuitem"
            >
              <span className="item-icon">{item.icon}</span>
              <span className="item-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
