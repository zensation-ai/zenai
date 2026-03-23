import { panelReducer, initialPanelState, PanelState, PanelAction, loadPanelWidth, savePanelWidth } from '../../../contexts/PanelContext';

describe('panelReducer', () => {
  const initial: PanelState = initialPanelState;

  it('opens a panel with OPEN_PANEL', () => {
    const action: PanelAction = { type: 'OPEN_PANEL', panel: 'tasks' };
    const state = panelReducer(initial, action);
    expect(state.activePanel).toBe('tasks');
    expect(state.pinned).toBe(false);
    expect(state.filter).toBeUndefined();
  });

  it('opens a panel with filter', () => {
    const action: PanelAction = { type: 'OPEN_PANEL', panel: 'tasks', filter: 'today' };
    const state = panelReducer(initial, action);
    expect(state.activePanel).toBe('tasks');
    expect(state.filter).toBe('today');
  });

  it('OPEN_PANEL always resets pinned to false', () => {
    const pinned: PanelState = { ...initial, activePanel: 'email', pinned: true };
    const action: PanelAction = { type: 'OPEN_PANEL', panel: 'tasks' };
    const state = panelReducer(pinned, action);
    expect(state.activePanel).toBe('tasks');
    expect(state.pinned).toBe(false);
  });

  it('closes panel with CLOSE_PANEL', () => {
    const open: PanelState = { ...initial, activePanel: 'tasks', pinned: true };
    const state = panelReducer(open, { type: 'CLOSE_PANEL' });
    expect(state.activePanel).toBeNull();
    expect(state.pinned).toBe(false);
  });

  it('toggles pin with TOGGLE_PIN', () => {
    const open: PanelState = { ...initial, activePanel: 'tasks', pinned: false };
    const state = panelReducer(open, { type: 'TOGGLE_PIN' });
    expect(state.pinned).toBe(true);
  });

  it('sets width with SET_WIDTH clamped to 360-600', () => {
    const state1 = panelReducer(initial, { type: 'SET_WIDTH', width: 500 });
    expect(state1.width).toBe(500);

    const state2 = panelReducer(initial, { type: 'SET_WIDTH', width: 200 });
    expect(state2.width).toBe(360);

    const state3 = panelReducer(initial, { type: 'SET_WIDTH', width: 800 });
    expect(state3.width).toBe(600);
  });

  it('OPEN_PANEL restores saved width for panel type', () => {
    savePanelWidth('email', 500);
    const action: PanelAction = { type: 'OPEN_PANEL', panel: 'email' };
    const state = panelReducer(initial, action);
    expect(state.activePanel).toBe('email');
    expect(state.width).toBe(500);
  });

  it('OPEN_PANEL uses default width when no saved width exists', () => {
    localStorage.removeItem('panel-width-calendar');
    const action: PanelAction = { type: 'OPEN_PANEL', panel: 'calendar' };
    const state = panelReducer(initial, action);
    expect(state.width).toBe(420); // DEFAULT_WIDTH
  });
});

describe('panel width persistence', () => {
  beforeEach(() => localStorage.clear());

  it('savePanelWidth stores to localStorage', () => {
    savePanelWidth('tasks', 450);
    expect(localStorage.getItem('panel-width-tasks')).toBe('450');
  });

  it('loadPanelWidth retrieves from localStorage', () => {
    localStorage.setItem('panel-width-email', '500');
    expect(loadPanelWidth('email')).toBe(500);
  });

  it('loadPanelWidth returns null for missing key', () => {
    expect(loadPanelWidth('search')).toBeNull();
  });

  it('loadPanelWidth returns null for invalid value', () => {
    localStorage.setItem('panel-width-tasks', 'not-a-number');
    expect(loadPanelWidth('tasks')).toBeNull();
  });
});
