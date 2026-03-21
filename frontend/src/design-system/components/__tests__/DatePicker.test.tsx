import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from '../DatePicker';

describe('DatePicker', () => {
  it('renders input with placeholder when no value', () => {
    render(<DatePicker onChange={() => {}} placeholder="Datum wählen" />);
    const input = screen.getByPlaceholderText('Datum wählen');
    expect(input).toBeDefined();
  });

  it('shows formatted date value when provided', () => {
    const date = new Date(2026, 2, 15); // March 15 2026
    render(<DatePicker value={date} onChange={() => {}} locale="de-DE" />);
    const input = screen.getByDisplayValue('15.03.2026');
    expect(input).toBeDefined();
  });

  it('opens calendar popup on input click', () => {
    render(<DatePicker onChange={() => {}} />);
    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('renders German month name in calendar header', () => {
    render(<DatePicker onChange={() => {}} />);
    fireEvent.click(screen.getByRole('textbox'));
    // Should contain one of the German month names
    const DE_MONTHS = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
    ];
    const header = screen.getByRole('dialog');
    const foundMonth = DE_MONTHS.some((m) => header.textContent?.includes(m));
    expect(foundMonth).toBe(true);
  });

  it('navigates to previous month on prev button click', () => {
    // Fix to a known month
    const date = new Date(2026, 5, 1); // June 2026
    render(<DatePicker value={date} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.click(screen.getByLabelText('Vorheriger Monat'));
    expect(screen.getByRole('dialog').textContent).toContain('Mai');
  });

  it('navigates to next month on next button click', () => {
    const date = new Date(2026, 5, 1); // June 2026
    render(<DatePicker value={date} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('textbox'));
    fireEvent.click(screen.getByLabelText('Nächster Monat'));
    expect(screen.getByRole('dialog').textContent).toContain('Juli');
  });

  it('calls onChange with selected date', () => {
    const onChange = vi.fn();
    const date = new Date(2026, 5, 1); // June 2026
    render(<DatePicker value={date} onChange={onChange} />);
    fireEvent.click(screen.getByRole('textbox'));
    // Click day "10"
    fireEvent.click(screen.getByLabelText('10.06.2026'));
    expect(onChange).toHaveBeenCalled();
    const called = onChange.mock.calls[0][0] as Date;
    expect(called.getDate()).toBe(10);
    expect(called.getMonth()).toBe(5);
  });

  it('does not open when disabled', () => {
    render(<DatePicker onChange={() => {}} disabled />);
    fireEvent.click(screen.getByRole('textbox'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows clear button when value is set', () => {
    const onChange = vi.fn();
    const date = new Date(2026, 2, 15);
    render(<DatePicker value={date} onChange={onChange} />);
    const clearBtn = screen.getByLabelText('Datum löschen');
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
