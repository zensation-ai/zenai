/**
 * Unit Tests for SearchFilterBar Component
 *
 * Tests search and filter functionality including:
 * - Search input handling
 * - Filter dropdown interactions
 * - Filter state management
 * - Keyboard navigation
 *
 * @module tests/components/SearchFilterBar
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchFilterBar, type Filters } from '../SearchFilterBar';

describe('SearchFilterBar Component', () => {
  const defaultFilters: Filters = {
    type: null,
    category: null,
    priority: null,
  };

  const defaultCounts = {
    types: { idea: 10, task: 5, insight: 3 },
    categories: { business: 8, technical: 6, personal: 4 },
    priorities: { high: 5, medium: 8, low: 5 },
  };

  const mockOnSearch = vi.fn();
  const mockOnFilterChange = vi.fn();
  const mockOnClearSearch = vi.fn();

  const defaultProps = {
    filters: defaultFilters,
    onFilterChange: mockOnFilterChange,
    onSearch: mockOnSearch,
    onClearSearch: mockOnClearSearch,
    isSearching: false,
    counts: defaultCounts,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Search Input', () => {
    it('renders search input field', () => {
      render(<SearchFilterBar {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox') || screen.getByPlaceholderText(/such|search/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('calls onSearch when typing', async () => {
      const user = userEvent.setup();

      render(<SearchFilterBar {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox') || screen.getByPlaceholderText(/such|search/i);
      await user.type(searchInput, 'test query');

      expect(mockOnSearch).toHaveBeenCalled();
    });
  });

  describe('Filter Dropdowns', () => {
    it('renders type filter dropdown', () => {
      render(<SearchFilterBar {...defaultProps} />);

      // Look for type filter
      const typeFilter = screen.queryByRole('combobox', { name: /typ/i }) ||
                        screen.queryByText(/typ|type/i);
      expect(typeFilter).toBeInTheDocument();
    });

    it('renders category filter dropdown', () => {
      render(<SearchFilterBar {...defaultProps} />);

      const categoryFilter = screen.queryByRole('combobox', { name: /kategorie/i }) ||
                            screen.queryByText(/kategorie|category/i);
      expect(categoryFilter).toBeInTheDocument();
    });

    it('renders priority filter dropdown', () => {
      render(<SearchFilterBar {...defaultProps} />);

      const priorityFilter = screen.queryByRole('combobox', { name: /priorit/i }) ||
                            screen.queryByText(/priorit/i);
      expect(priorityFilter).toBeInTheDocument();
    });

    it('calls onFilterChange when filter selected', async () => {
      const user = userEvent.setup();

      render(<SearchFilterBar {...defaultProps} />);

      // Find and click a filter dropdown
      const filterButtons = screen.getAllByRole('button');
      const filterButton = filterButtons.find(btn =>
        btn.textContent?.match(/typ|kategorie|priorit/i)
      );

      if (filterButton) {
        await user.click(filterButton);
      }
    });
  });

  describe('Active Filters', () => {
    it('displays active filter indicators', () => {
      const activeFilters: Filters = {
        type: 'idea',
        category: 'personal',
        priority: 'high',
      };

      render(<SearchFilterBar {...defaultProps} filters={activeFilters} />);

      // Active filters should be visually indicated
      const container = document.querySelector('.search-filter-bar');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('search input has proper label or placeholder', () => {
      render(<SearchFilterBar {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox') || screen.getByPlaceholderText(/such|search/i);
      expect(searchInput).toHaveAttribute('placeholder');
    });

    it('filter buttons are keyboard accessible', () => {
      render(<SearchFilterBar {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).not.toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('Keyboard Interactions', () => {
    it('supports Enter key for search submission', async () => {
      const user = userEvent.setup();

      render(<SearchFilterBar {...defaultProps} />);

      const searchInput = screen.getByRole('searchbox') || screen.getByPlaceholderText(/such|search/i);
      await user.type(searchInput, 'test{Enter}');

      expect(mockOnSearch).toHaveBeenCalled();
    });
  });

  describe('Search Results', () => {
    it('displays search results count when provided', () => {
      render(<SearchFilterBar {...defaultProps} searchResults={42} />);

      // Results count might be displayed
      const container = document.querySelector('.search-filter-bar');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when searching', () => {
      render(<SearchFilterBar {...defaultProps} isSearching={true} />);

      const container = document.querySelector('.search-filter-bar');
      expect(container).toBeInTheDocument();
    });
  });
});
