import { useState, useRef, useEffect, useCallback, useId } from 'react';
import './DatePicker.css';

export interface DatePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  locale?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
}

const DE_DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DE_MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday=0 … Sunday=6 offset for the 1st of the month */
function firstDayOffset(year: number, month: number) {
  const day = startOfMonth(year, month).getDay(); // 0=Sun…6=Sat
  return day === 0 ? 6 : day - 1; // shift so Mon=0
}

function formatDate(date: Date, locale = 'de-DE') {
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Datum wählen',
  minDate,
  maxDate,
  locale = 'de-DE',
  disabled = false,
  label,
  className,
}: DatePickerProps) {
  const uid = useId();
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    value ? value.getFullYear() : today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(
    value ? value.getMonth() : today.getMonth()
  );

  const containerRef = useRef<HTMLDivElement>(null);

  const openCalendar = () => {
    if (disabled) return;
    setOpen(true);
  };

  const closeCalendar = useCallback(() => {
    setOpen(false);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeCalendar();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closeCalendar]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCalendar();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeCalendar]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isDisabledDate = (date: Date) => {
    if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()))
      return true;
    if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()))
      return true;
    return false;
  };

  const handleDayClick = (day: number) => {
    const selected = new Date(viewYear, viewMonth, day);
    if (isDisabledDate(selected)) return;
    onChange(selected);
    closeCalendar();
  };

  // Build calendar grid
  const offset = firstDayOffset(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const wrapperClass = ['ds-datepicker', className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={wrapperClass} ref={containerRef}>
      {label && (
        <label
          id={`${uid}-label`}
          htmlFor={`${uid}-input`}
          className="ds-datepicker__label"
        >
          {label}
        </label>
      )}
      <div className="ds-datepicker__input-wrap">
        <input
          id={`${uid}-input`}
          type="text"
          readOnly
          className={`ds-datepicker__input${open ? ' ds-datepicker__input--open' : ''}`}
          value={value ? formatDate(value, locale) : ''}
          placeholder={placeholder}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={label ? `${uid}-label` : undefined}
          onClick={openCalendar}
          onFocus={openCalendar}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open ? closeCalendar() : openCalendar();
            }
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            className="ds-datepicker__clear"
            aria-label="Datum löschen"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Kalender"
          aria-modal="true"
          className="ds-datepicker__calendar"
        >
          {/* Month/Year header */}
          <div className="ds-datepicker__header">
            <button
              type="button"
              className="ds-datepicker__nav"
              onClick={prevMonth}
              aria-label="Vorheriger Monat"
            >
              ‹
            </button>
            <span className="ds-datepicker__month-year">
              {DE_MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              className="ds-datepicker__nav"
              onClick={nextMonth}
              aria-label="Nächster Monat"
            >
              ›
            </button>
          </div>

          {/* Day headers */}
          <div className="ds-datepicker__weekdays">
            {DE_DAYS.map((d) => (
              <span key={d} className="ds-datepicker__weekday" aria-hidden="true">
                {d}
              </span>
            ))}
          </div>

          {/* Day grid */}
          <div className="ds-datepicker__grid">
            {cells.map((day, idx) => {
              if (day === null) {
                return <span key={`e-${idx}`} className="ds-datepicker__cell ds-datepicker__cell--empty" />;
              }
              const date = new Date(viewYear, viewMonth, day);
              const isSelected = value ? isSameDay(date, value) : false;
              const isToday = isSameDay(date, today);
              const isOff = isDisabledDate(date);

              return (
                <button
                  key={day}
                  type="button"
                  className={[
                    'ds-datepicker__cell',
                    isSelected ? 'ds-datepicker__cell--selected' : '',
                    isToday && !isSelected ? 'ds-datepicker__cell--today' : '',
                    isOff ? 'ds-datepicker__cell--disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={isOff}
                  aria-label={formatDate(date, locale)}
                  aria-pressed={isSelected}
                  onClick={() => handleDayClick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
