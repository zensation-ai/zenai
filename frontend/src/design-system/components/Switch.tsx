import type { ChangeEventHandler } from 'react';
import './Switch.css';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
  id?: string;
  className?: string;
}

let _counter = 0;

export function Switch({ label, checked, onChange, disabled = false, id, className }: SwitchProps) {
  const switchId = id ?? `ds-switch-${++_counter}`;

  const wrapperClasses = [
    'ds-switch',
    checked ? 'ds-switch--checked' : '',
    disabled ? 'ds-switch--disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label htmlFor={switchId} className={wrapperClasses}>
      <input
        type="checkbox"
        id={switchId}
        role="switch"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="ds-switch__input"
      />
      <span className="ds-switch__track" aria-hidden="true">
        <span className="ds-switch__thumb" />
      </span>
      <span className="ds-switch__label">{label}</span>
    </label>
  );
}
