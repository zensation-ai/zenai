import { useState, useRef, useEffect, useCallback, useId } from 'react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchable = false,
  multiple = false,
  disabled = false,
  label,
  className,
}: SelectProps) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const labelId = `${uid}-label`;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedValues = Array.isArray(value)
    ? value
    : value != null
      ? [value]
      : [];

  const filtered = searchable
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const displayLabel = () => {
    if (selectedValues.length === 0) return null;
    if (multiple) {
      return selectedValues
        .map((v) => options.find((o) => o.value === v)?.label ?? v)
        .join(', ');
    }
    return options.find((o) => o.value === selectedValues[0])?.label ?? selectedValues[0];
  };

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setFocusedIndex(-1);
    setSearch('');
  };

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearch('');
    setFocusedIndex(-1);
  }, []);

  const handleSelect = useCallback(
    (optValue: string) => {
      if (multiple) {
        const next = selectedValues.includes(optValue)
          ? selectedValues.filter((v) => v !== optValue)
          : [...selectedValues, optValue];
        onChange(next);
      } else {
        onChange(optValue);
        closeDropdown();
      }
    },
    [multiple, selectedValues, onChange, closeDropdown]
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closeDropdown]);

  // Focus search when opened
  useEffect(() => {
    if (open && searchable) {
      searchRef.current?.focus();
    }
  }, [open, searchable]);

  // Scroll focused option into view
  useEffect(() => {
    if (focusedIndex < 0) return;
    const item = listRef.current?.children[focusedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((i) => {
          const next = i + 1;
          return next < filtered.length ? next : i;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((i) => (i > 0 ? i - 1 : 0));
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(filtered.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filtered.length) {
          const opt = filtered[focusedIndex];
          if (!opt.disabled) handleSelect(opt.value);
        }
        break;
      default:
        break;
    }
  };

  const wrapperClass = [
    'ds-select-wrapper',
    disabled ? 'ds-select-wrapper--disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const triggerClass = [
    'ds-select__trigger',
    open ? 'ds-select__trigger--open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const shown = displayLabel();

  return (
    <div className={wrapperClass} ref={containerRef}>
      {label && (
        <label id={labelId} className="ds-select__label">
          {label}
        </label>
      )}
      <div
        className={triggerClass}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        aria-labelledby={label ? labelId : undefined}
        aria-controls={listboxId}
        tabIndex={disabled ? -1 : 0}
        onClick={open ? closeDropdown : openDropdown}
        onKeyDown={handleKeyDown}
      >
        <span className={`ds-select__value ${shown ? '' : 'ds-select__value--placeholder'}`}>
          {shown ?? placeholder}
        </span>
        <span className={`ds-select__chevron ${open ? 'ds-select__chevron--open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </div>

      {open && (
        <div className="ds-select__dropdown">
          {searchable && (
            <div className="ds-select__search-wrap">
              <input
                ref={searchRef}
                type="text"
                className="ds-select__search"
                placeholder="Search…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                aria-label="Search options"
                autoComplete="off"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="ds-select__list"
            aria-multiselectable={multiple}
            aria-label={label}
          >
            {filtered.length === 0 ? (
              <li className="ds-select__no-results">No options</li>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = selectedValues.includes(opt.value);
                const isFocused = idx === focusedIndex;
                return (
                  <li
                    key={opt.value}
                    id={`${uid}-opt-${opt.value}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    className={[
                      'ds-select__option',
                      isSelected ? 'ds-select__option--selected' : '',
                      isFocused ? 'ds-select__option--focused' : '',
                      opt.disabled ? 'ds-select__option--disabled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onPointerDown={(e) => {
                      e.preventDefault(); // don't blur trigger
                      if (!opt.disabled) handleSelect(opt.value);
                    }}
                    onMouseEnter={() => !opt.disabled && setFocusedIndex(idx)}
                  >
                    {multiple && (
                      <span
                        className="ds-select__check"
                        aria-hidden="true"
                      >
                        {isSelected ? '✓' : ''}
                      </span>
                    )}
                    {opt.label}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
