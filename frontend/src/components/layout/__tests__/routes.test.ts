import { describe, it, expect } from 'vitest';
import { PAGE_PATHS, PATH_PAGES, LEGACY_REDIRECTS, resolvePathToPage } from '../../../routes';

describe('Route Mappings (Phase 105)', () => {
  it('hub maps to /', () => {
    expect(PAGE_PATHS['hub']).toBe('/');
    expect(PATH_PAGES['/']).toBe('hub');
  });

  it('home and chat also map to / (merged into hub)', () => {
    expect(PAGE_PATHS['home']).toBe('/');
    expect(PAGE_PATHS['chat']).toBe('/');
  });

  it('7 Smart Pages have correct German slug paths', () => {
    expect(PAGE_PATHS['ideas']).toBe('/ideen');
    expect(PAGE_PATHS['calendar']).toBe('/planer');
    expect(PAGE_PATHS['email']).toBe('/inbox');
    expect(PAGE_PATHS['documents']).toBe('/wissen');
    expect(PAGE_PATHS['business']).toBe('/cockpit');
    expect(PAGE_PATHS['my-ai']).toBe('/meine-ki');
    expect(PAGE_PATHS['settings']).toBe('/system');
  });

  it('PATH_PAGES reverse map for all 7+1 primary routes', () => {
    expect(PATH_PAGES['/ideen']).toBe('ideas');
    expect(PATH_PAGES['/planer']).toBe('calendar');
    expect(PATH_PAGES['/inbox']).toBe('email');
    expect(PATH_PAGES['/wissen']).toBe('documents');
    expect(PATH_PAGES['/cockpit']).toBe('business');
    expect(PATH_PAGES['/meine-ki']).toBe('my-ai');
    expect(PATH_PAGES['/system']).toBe('settings');
  });

  it('legacy redirects include all old primary paths', () => {
    const fromPaths = LEGACY_REDIRECTS.map(r => r.from);
    // Old primary routes that changed to German slugs
    expect(fromPaths).toContain('/chat');
    expect(fromPaths).toContain('/ideas');
    expect(fromPaths).toContain('/calendar');
    expect(fromPaths).toContain('/email');
    expect(fromPaths).toContain('/documents');
    expect(fromPaths).toContain('/business');
    expect(fromPaths).toContain('/my-ai');
    expect(fromPaths).toContain('/settings');
  });

  it('legacy redirects include old standalone pages', () => {
    const fromPaths = LEGACY_REDIRECTS.map(r => r.from);
    expect(fromPaths).toContain('/browser');
    expect(fromPaths).toContain('/workshop');
    expect(fromPaths).toContain('/contacts');
    expect(fromPaths).toContain('/finance');
    expect(fromPaths).toContain('/insights');
    expect(fromPaths).toContain('/learning');
    expect(fromPaths).toContain('/screen-memory');
    expect(fromPaths).toContain('/notifications');
    expect(fromPaths).toContain('/admin');
  });

  it('legacy redirects include old double-legacy paths', () => {
    const fromPaths = LEGACY_REDIRECTS.map(r => r.from);
    expect(fromPaths).toContain('/incubator');
    expect(fromPaths).toContain('/ai-workshop');
    expect(fromPaths).toContain('/personalization');
    expect(fromPaths).toContain('/voice-chat');
    expect(fromPaths).toContain('/agent-teams');
    expect(fromPaths).toContain('/dashboard');
    expect(fromPaths).toContain('/analytics');
    expect(fromPaths).toContain('/digest');
    expect(fromPaths).toContain('/knowledge-graph');
    expect(fromPaths).toContain('/learning-tasks');
  });

  it('legacy redirects point to correct new locations', () => {
    const map = Object.fromEntries(LEGACY_REDIRECTS.map(r => [r.from, r.to]));
    expect(map['/chat']).toBe('/');
    expect(map['/browser']).toBe('/');
    expect(map['/ideas']).toBe('/ideen');
    expect(map['/calendar']).toBe('/planer');
    expect(map['/email']).toBe('/inbox');
    expect(map['/contacts']).toBe('/planer/kontakte');
    expect(map['/finance']).toBe('/cockpit/finanzen');
    expect(map['/notifications']).toBe('/inbox/benachrichtigungen');
    expect(map['/learning']).toBe('/wissen/lernen');
    expect(map['/admin']).toBe('/system/admin');
  });

  it('resolvePathToPage handles new German slug paths', () => {
    expect(resolvePathToPage('/')).toBe('hub');
    expect(resolvePathToPage('/ideen')).toBe('ideas');
    expect(resolvePathToPage('/planer')).toBe('calendar');
    expect(resolvePathToPage('/inbox')).toBe('email');
    expect(resolvePathToPage('/wissen')).toBe('documents');
    expect(resolvePathToPage('/cockpit')).toBe('business');
    expect(resolvePathToPage('/meine-ki')).toBe('my-ai');
    expect(resolvePathToPage('/system')).toBe('settings');
  });

  it('resolvePathToPage handles sub-paths under new slugs', () => {
    expect(resolvePathToPage('/planer/tasks')).toBe('calendar');
    expect(resolvePathToPage('/ideen/incubator')).toBe('ideas');
    expect(resolvePathToPage('/system/admin')).toBe('settings');
    expect(resolvePathToPage('/cockpit/finanzen')).toBe('business');
    expect(resolvePathToPage('/wissen/canvas')).toBe('documents');
    expect(resolvePathToPage('/meine-ki/voice-chat')).toBe('my-ai');
    expect(resolvePathToPage('/inbox/benachrichtigungen')).toBe('email');
  });

  it('resolvePathToPage still handles old English paths as fallback', () => {
    // Before redirect kicks in, the resolver should still recognize old paths
    expect(resolvePathToPage('/ideas/archive')).toBe('ideas');
    expect(resolvePathToPage('/calendar/tasks')).toBe('calendar');
    expect(resolvePathToPage('/settings/profile')).toBe('settings');
    expect(resolvePathToPage('/workshop/proactive')).toBe('ideas');
  });

  it('resolvePathToPage defaults to hub for unknown paths', () => {
    expect(resolvePathToPage('/nonexistent')).toBe('hub');
    expect(resolvePathToPage('/totally/unknown/path')).toBe('hub');
  });
});
