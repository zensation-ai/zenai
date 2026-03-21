import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from '../Select';

const options = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

describe('Select', () => {
  it('renders trigger with placeholder when no value', () => {
    render(<Select options={options} onChange={() => {}} placeholder="Pick one" />);
    expect(screen.getByText('Pick one')).toBeDefined();
  });

  it('shows selected value label', () => {
    render(<Select options={options} value="banana" onChange={() => {}} />);
    expect(screen.getByText('Banana')).toBeDefined();
  });

  it('opens dropdown on click and shows options', () => {
    render(<Select options={options} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByText('Apple')).toBeDefined();
    expect(screen.getByText('Banana')).toBeDefined();
  });

  it('calls onChange with selected value', () => {
    const onChange = vi.fn();
    render(<Select options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.pointerDown(screen.getByText('Cherry'));
    expect(onChange).toHaveBeenCalledWith('cherry');
  });

  it('filters options when searchable', () => {
    render(<Select options={options} searchable onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = screen.getByPlaceholderText('Search…');
    fireEvent.change(searchInput, { target: { value: 'ban' } });
    expect(screen.getByText('Banana')).toBeDefined();
    expect(screen.queryByText('Apple')).toBeNull();
  });

  it('navigates options with keyboard ArrowDown/Enter', () => {
    const onChange = vi.fn();
    render(<Select options={options} onChange={onChange} />);
    const combobox = screen.getByRole('combobox');
    // Open with ArrowDown (focusedIndex becomes -1, dropdown opens)
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    // Move focused index from -1 to 0
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    // Select the focused option (index 0 = apple)
    fireEvent.keyDown(combobox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('apple');
  });

  it('closes dropdown on Escape', () => {
    render(<Select options={options} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows "No options" when search returns no results', () => {
    render(<Select options={options} searchable onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Search…'), {
      target: { value: 'xyz' },
    });
    expect(screen.getByText('No options')).toBeDefined();
  });

  it('supports multiple selection', () => {
    const onChange = vi.fn();
    render(
      <Select options={options} multiple value={['apple']} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.pointerDown(screen.getByText('Banana'));
    expect(onChange).toHaveBeenCalledWith(['apple', 'banana']);
  });
});
