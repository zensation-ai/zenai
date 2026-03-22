import { panelReducer, initialPanelState, PanelState, PanelAction } from '../../../contexts/PanelContext';

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
});
