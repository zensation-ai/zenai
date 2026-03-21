import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Table } from '../Table';

const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'age', label: 'Age' },
];

const data = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
];

describe('Table', () => {
  it('renders column headers and data rows', () => {
    render(<Table columns={columns} data={data} />);
    expect(screen.getByText('Name')).toBeDefined();
    expect(screen.getByText('Age')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('30')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
  });

  it('shows empty message when data is empty', () => {
    render(<Table columns={columns} data={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeDefined();
  });

  it('calls onSort when a sortable header is clicked', () => {
    const onSort = vi.fn();
    render(<Table columns={columns} data={data} sortable onSort={onSort} />);
    fireEvent.click(screen.getByText('Name'));
    expect(onSort).toHaveBeenCalledWith('name', 'asc');
  });

  it('toggles sort direction on second click', () => {
    const onSort = vi.fn();
    render(<Table columns={columns} data={data} sortable onSort={onSort} />);
    fireEvent.click(screen.getByText('Name'));
    fireEvent.click(screen.getByText('Name'));
    expect(onSort).toHaveBeenLastCalledWith('name', 'desc');
  });

  it('sets aria-sort attribute on sorted column', () => {
    render(<Table columns={columns} data={data} sortable onSort={() => {}} />);
    const nameHeader = screen.getByText('Name').closest('th');
    // Initial state: none
    expect(nameHeader?.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(screen.getByText('Name'));
    expect(nameHeader?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('renders selection checkboxes when selectable', () => {
    const onSelectionChange = vi.fn();
    render(
      <Table
        columns={columns}
        data={data}
        selectable
        selectedKeys={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    // 1 select-all + 2 rows
    expect(checkboxes.length).toBe(3);
  });

  it('renders custom cell via render prop', () => {
    const customColumns = [
      { key: 'name', label: 'Name', render: (_v: any, row: any) => <strong>{row.name}!</strong> },
    ];
    render(<Table columns={customColumns} data={data} />);
    expect(screen.getByText('Alice!')).toBeDefined();
  });
});
