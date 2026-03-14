import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import './Input.css';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Render as textarea instead of input */
  as?: 'input' | 'textarea';
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
  /** Number of rows when as="textarea" */
  rows?: number;
}

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  function Input(
    {
      as = 'input',
      label,
      error,
      helperText,
      icon,
      className,
      id: idProp,
      rows = 4,
      ...rest
    },
    ref
  ) {
    const autoId = useId();
    const id = idProp ?? autoId;
    const errorId = error ? `${id}-error` : undefined;
    const helperId = helperText && !error ? `${id}-helper` : undefined;
    const describedBy = errorId ?? helperId;

    const wrapperClasses = [
      'ds-input-wrapper',
      error ? 'ds-input-wrapper--error' : '',
      icon ? 'ds-input-wrapper--has-icon' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    const sharedProps = {
      id,
      className: 'ds-input__field',
      'aria-invalid': error ? (true as const) : undefined,
      'aria-describedby': describedBy,
      ...rest,
    };

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={id} className="ds-input__label">
            {label}
          </label>
        )}
        <div className="ds-input__container">
          {icon && <span className="ds-input__icon" aria-hidden="true">{icon}</span>}
          {as === 'textarea' ? (
            <textarea
              ref={ref as React.Ref<HTMLTextAreaElement>}
              rows={rows}
              {...(sharedProps as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            />
          ) : (
            <input
              ref={ref as React.Ref<HTMLInputElement>}
              {...(sharedProps as InputHTMLAttributes<HTMLInputElement>)}
            />
          )}
        </div>
        {error && (
          <span id={errorId} className="ds-input__error" role="alert">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={helperId} className="ds-input__helper">
            {helperText}
          </span>
        )}
      </div>
    );
  }
);
