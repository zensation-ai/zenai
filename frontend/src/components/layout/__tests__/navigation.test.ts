import { describe, it, expect } from 'vitest';
import {
  NAV_ITEMS,
  NAV_HUB_ITEM,
  ALL_NAVIGABLE_ITEMS,
  isNavItemActive,
  getPageLabel,
  getNavItemByPage,
} from '../../../navigation';

describe('Navigation 7+1 Structure (Phase 105)', () => {
  it('exports exactly 7 nav items (excluding hub)', () => {
    expect(NAV_ITEMS).toHaveLength(7);
  });

  it('exports hub item pointing to chat hub', () => {
    expect(NAV_HUB_ITEM).toBeDefined();
    expect(NAV_HUB_ITEM.page).toBe('hub');
    expect(NAV_HUB_ITEM.icon).toBe('MessageSquare');
  });

  it('has correct 7 items in order: Ideen, Planer, Inbox, Wissen, Cockpit, Meine KI, System', () => {
    const labels = NAV_ITEMS.map(i => i.label);
    expect(labels).toEqual([
      'Ideen',
      'Planer',
      'Inbox',
      'Wissen',
      'Cockpit',
      'Meine KI',
      'System',
    ]);
  });

  it('each nav item has a page, icon, and label', () => {
    for (const item of NAV_ITEMS) {
      expect(item.page).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.label).toBeTruthy();
    }
  });

  it('nav items point to existing intermediary pages', () => {
    const pages = NAV_ITEMS.map(i => i.page);
    expect(pages).toEqual([
      'ideas',      // Ideen -> existing /ideas
      'calendar',   // Planer -> existing /calendar
      'email',      // Inbox -> existing /email
      'documents',  // Wissen -> existing /documents
      'business',   // Cockpit -> existing /business (intermediary for Business+Finance+Insights)
      'my-ai',      // Meine KI -> existing /my-ai
      'settings',   // System -> existing /settings
    ]);
  });

  it('ALL_NAVIGABLE_ITEMS includes hub + 7 items = 8 total', () => {
    expect(ALL_NAVIGABLE_ITEMS).toHaveLength(8);
    expect(ALL_NAVIGABLE_ITEMS[0].page).toBe('hub');
  });

  it('isNavItemActive matches subPages', () => {
    const planer = NAV_ITEMS.find(i => i.label === 'Planer')!;
    expect(isNavItemActive(planer, 'calendar')).toBe(true);
    expect(isNavItemActive(planer, 'tasks')).toBe(true);
    expect(isNavItemActive(planer, 'contacts')).toBe(true);
    expect(isNavItemActive(planer, 'ideas')).toBe(false);
  });

  it('getPageLabel returns correct labels for new structure', () => {
    expect(getPageLabel('hub')).toBe('Chat Hub');
    expect(getPageLabel('ideas')).toBe('Ideen');
    expect(getPageLabel('calendar')).toBe('Planer');
    expect(getPageLabel('email')).toBe('Inbox');
    expect(getPageLabel('documents')).toBe('Wissen');
    expect(getPageLabel('business')).toBe('Cockpit');
    expect(getPageLabel('my-ai')).toBe('Meine KI');
    expect(getPageLabel('settings')).toBe('System');
  });

  it('getNavItemByPage finds items for subPages too', () => {
    const item = getNavItemByPage('contacts');
    expect(item).toBeDefined();
    expect(item!.label).toBe('Planer');
  });

  it('getPageLabel returns parent label for sub-pages', () => {
    expect(getPageLabel('tasks')).toBe('Planer');
    expect(getPageLabel('canvas')).toBe('Wissen');
    expect(getPageLabel('finance')).toBe('Cockpit');
    expect(getPageLabel('voice-chat')).toBe('Meine KI');
    expect(getPageLabel('system-admin')).toBe('System');
  });

  it('does NOT export NAV_SECTIONS (removed)', async () => {
    const nav = await import('../../../navigation');
    expect((nav as Record<string, unknown>).NAV_SECTIONS).toBeUndefined();
  });

  it('does NOT export NAV_BROWSER_ITEM (removed)', async () => {
    const nav = await import('../../../navigation');
    expect((nav as Record<string, unknown>).NAV_BROWSER_ITEM).toBeUndefined();
  });
});
