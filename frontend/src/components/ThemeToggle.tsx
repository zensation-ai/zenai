/**
 * Theme Toggle Component
 *
 * A button to switch between light, dark, and system themes.
 * Shows current theme state with icon.
 *
 * @module components/ThemeToggle
 */

import { useTheme } from '../contexts/ThemeContext';
import './ThemeToggle.css';

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({ showLabel = false, className = '' }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'system') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('system');
    }
  };

  const getIcon = () => {
    if (theme === 'system') {
      return '💻';
    }
    return resolvedTheme === 'dark' ? '🌙' : '☀️';
  };

  const getLabel = () => {
    if (theme === 'system') {
      return 'System';
    }
    return resolvedTheme === 'dark' ? 'Dunkel' : 'Hell';
  };

  const getTitle = () => {
    const nextTheme = theme === 'system' ? 'Hell' : theme === 'light' ? 'Dunkel' : 'System';
    return `Theme wechseln zu ${nextTheme}`;
  };

  return (
    <button
      className={`theme-toggle ${className}`}
      onClick={cycleTheme}
      title={getTitle()}
      aria-label={getTitle()}
      type="button"
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {getIcon()}
      </span>
      {showLabel && (
        <span className="theme-toggle-label">{getLabel()}</span>
      )}
    </button>
  );
}

export default ThemeToggle;
