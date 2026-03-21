import { useState, useCallback, useId } from 'react';
import type { ReactNode } from 'react';
import './Table.css';

export interface TableColumn<T = any> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => ReactNode;
  width?: string;
}

export interface TableProps<T = any> {
  columns: TableColumn<T>[];
  data: T[];
  keyField?: string;
  sortable?: boolean;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  emptyMessage?: string;
  className?: string;
}

type SortDir = 'asc' | 'desc';

export function Table<T extends Record<string, any>>({
  columns,
  data,
  keyField = 'id',
  sortable = false,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  onSort,
  emptyMessage = 'No data',
  className,
}: TableProps<T>) {
  const uid = useId();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback(
    (key: string) => {
      const nextDir: SortDir =
        sortKey === key && sortDir === 'asc' ? 'desc' : 'asc';
      setSortKey(key);
      setSortDir(nextDir);
      onSort?.(key, nextDir);
    },
    [sortKey, sortDir, onSort]
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (!onSelectionChange) return;
      if (checked) {
        onSelectionChange(new Set(data.map((row) => String(row[keyField]))));
      } else {
        onSelectionChange(new Set());
      }
    },
    [data, keyField, onSelectionChange]
  );

  const handleSelectRow = useCallback(
    (rowKey: string, checked: boolean) => {
      if (!onSelectionChange || !selectedKeys) return;
      const next = new Set(selectedKeys);
      if (checked) {
        next.add(rowKey);
      } else {
        next.delete(rowKey);
      }
      onSelectionChange(next);
    },
    [selectedKeys, onSelectionChange]
  );

  const allSelected =
    selectable &&
    selectedKeys != null &&
    data.length > 0 &&
    data.every((row) => selectedKeys.has(String(row[keyField])));
  const someSelected =
    selectable &&
    selectedKeys != null &&
    data.some((row) => selectedKeys.has(String(row[keyField])));

  const tableClass = ['ds-table-wrapper', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={tableClass}>
      <div className="ds-table-scroll">
        <table className="ds-table" aria-labelledby={`${uid}-caption`}>
          <thead className="ds-table__head">
            <tr>
              {selectable && (
                <th className="ds-table__th ds-table__th--check" scope="col">
                  <input
                    type="checkbox"
                    className="ds-table__checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && !!someSelected;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => {
                const isSortable = sortable && col.sortable !== false;
                const ariaSort =
                  sortKey === col.key
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none';

                return (
                  <th
                    key={col.key}
                    className={[
                      'ds-table__th',
                      isSortable ? 'ds-table__th--sortable' : '',
                      sortKey === col.key ? 'ds-table__th--sorted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={isSortable ? ariaSort : undefined}
                    onClick={isSortable ? () => handleSort(col.key) : undefined}
                    tabIndex={isSortable ? 0 : undefined}
                    onKeyDown={
                      isSortable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSort(col.key);
                            }
                          }
                        : undefined
                    }
                  >
                    <span className="ds-table__th-content">
                      {col.label}
                      {isSortable && (
                        <span
                          className={`ds-table__sort-icon ${
                            sortKey === col.key
                              ? `ds-table__sort-icon--${sortDir}`
                              : ''
                          }`}
                          aria-hidden="true"
                        >
                          ▲
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="ds-table__body">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="ds-table__empty"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const rowKey = String(row[keyField]);
                const isSelected = selectedKeys?.has(rowKey) ?? false;
                return (
                  <tr
                    key={rowKey}
                    className={`ds-table__row ${isSelected ? 'ds-table__row--selected' : ''}`}
                    aria-selected={selectable ? isSelected : undefined}
                  >
                    {selectable && (
                      <td className="ds-table__td ds-table__td--check">
                        <input
                          type="checkbox"
                          className="ds-table__checkbox"
                          checked={isSelected}
                          onChange={(e) =>
                            handleSelectRow(rowKey, e.target.checked)
                          }
                          aria-label={`Select row ${rowKey}`}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="ds-table__td">
                        {col.render
                          ? col.render(row[col.key], row)
                          : (row[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
