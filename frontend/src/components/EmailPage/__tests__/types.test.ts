import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INBOX_FILTERS,
  INBOX_FOLDER_CHIPS,
  INBOX_STATUS_CHIPS,
  INBOX_CATEGORY_CHIPS,
} from '../types';
import type {
  InboxViewMode,
  InboxFilters,
  InboxPanelState,
  InboxFilterChipDef,
} from '../types';

describe('EmailPage Smart Page Types (Phase 108)', () => {
  describe('InboxViewMode', () => {
    it('should accept valid view mode values', () => {
      const modes: InboxViewMode[] = ['list', 'grid', 'conversation'];
      expect(modes).toHaveLength(3);
      expect(modes).toContain('list');
      expect(modes).toContain('grid');
      expect(modes).toContain('conversation');
    });
  });

  describe('DEFAULT_INBOX_FILTERS', () => {
    it('should have folders as empty Set', () => {
      expect(DEFAULT_INBOX_FILTERS.folders).toBeInstanceOf(Set);
      expect(DEFAULT_INBOX_FILTERS.folders.size).toBe(0);
    });

    it('should have statuses as empty Set', () => {
      expect(DEFAULT_INBOX_FILTERS.statuses).toBeInstanceOf(Set);
      expect(DEFAULT_INBOX_FILTERS.statuses.size).toBe(0);
    });

    it('should have categories as empty Set', () => {
      expect(DEFAULT_INBOX_FILTERS.categories).toBeInstanceOf(Set);
      expect(DEFAULT_INBOX_FILTERS.categories.size).toBe(0);
    });

    it('should have search as empty string', () => {
      expect(DEFAULT_INBOX_FILTERS.search).toBe('');
    });

    it('should have accountId as null', () => {
      expect(DEFAULT_INBOX_FILTERS.accountId).toBeNull();
    });

    it('should satisfy the InboxFilters interface shape', () => {
      const filters: InboxFilters = DEFAULT_INBOX_FILTERS;
      expect(filters).toBeDefined();
    });
  });

  describe('InboxPanelState type', () => {
    it('should accept valid panel state objects', () => {
      const state: InboxPanelState = { open: false, emailId: null, mode: 'detail' };
      expect(state.open).toBe(false);
      expect(state.emailId).toBeNull();
      expect(state.mode).toBe('detail');
    });

    it('should accept compose mode', () => {
      const state: InboxPanelState = { open: true, emailId: null, mode: 'compose' };
      expect(state.mode).toBe('compose');
    });

    it('should accept reply mode', () => {
      const state: InboxPanelState = { open: true, emailId: 'abc123', mode: 'reply' };
      expect(state.mode).toBe('reply');
    });
  });

  describe('INBOX_FOLDER_CHIPS', () => {
    it('should have exactly 5 items', () => {
      expect(INBOX_FOLDER_CHIPS).toHaveLength(5);
    });

    it('each chip should have id, label, group, value properties', () => {
      INBOX_FOLDER_CHIPS.forEach((chip: InboxFilterChipDef) => {
        expect(chip).toHaveProperty('id');
        expect(chip).toHaveProperty('label');
        expect(chip).toHaveProperty('group');
        expect(chip).toHaveProperty('value');
        expect(typeof chip.id).toBe('string');
        expect(typeof chip.label).toBe('string');
        expect(chip.group).toBe('folder');
        expect(typeof chip.value).toBe('string');
      });
    });

    it('should contain inbox, sent, drafts, archived, trash folders', () => {
      const values = INBOX_FOLDER_CHIPS.map((c) => c.value);
      expect(values).toContain('inbox');
      expect(values).toContain('sent');
      expect(values).toContain('drafts');
      expect(values).toContain('archived');
      expect(values).toContain('trash');
    });
  });

  describe('INBOX_STATUS_CHIPS', () => {
    it('should have exactly 2 items', () => {
      expect(INBOX_STATUS_CHIPS).toHaveLength(2);
    });

    it('each chip should have id, label, group, value properties', () => {
      INBOX_STATUS_CHIPS.forEach((chip: InboxFilterChipDef) => {
        expect(chip).toHaveProperty('id');
        expect(chip).toHaveProperty('label');
        expect(chip).toHaveProperty('group');
        expect(chip).toHaveProperty('value');
        expect(chip.group).toBe('status');
      });
    });

    it('should contain unread and starred statuses', () => {
      const values = INBOX_STATUS_CHIPS.map((c) => c.value);
      expect(values).toContain('unread');
      expect(values).toContain('starred');
    });
  });

  describe('INBOX_CATEGORY_CHIPS', () => {
    it('should have exactly 4 items', () => {
      expect(INBOX_CATEGORY_CHIPS).toHaveLength(4);
    });

    it('each chip should have id, label, group, value properties', () => {
      INBOX_CATEGORY_CHIPS.forEach((chip: InboxFilterChipDef) => {
        expect(chip).toHaveProperty('id');
        expect(chip).toHaveProperty('label');
        expect(chip).toHaveProperty('group');
        expect(chip).toHaveProperty('value');
        expect(chip.group).toBe('category');
      });
    });

    it('should contain business, personal, newsletter, notification categories', () => {
      const values = INBOX_CATEGORY_CHIPS.map((c) => c.value);
      expect(values).toContain('business');
      expect(values).toContain('personal');
      expect(values).toContain('newsletter');
      expect(values).toContain('notification');
    });
  });
});
