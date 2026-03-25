import { panelRegistry, getPanelDefinition } from '../panelRegistry';
import type { PanelType } from '../../../contexts/PanelContext';

describe('panelRegistry', () => {
  const allPanelTypes: PanelType[] = [
    'tasks', 'email', 'ideas', 'calendar', 'contacts',
    'documents', 'memory', 'finance', 'agents', 'search',
    'settings', 'dashboard',
  ];

  it('has definitions for all 12 panel types', () => {
    expect(panelRegistry).toHaveLength(12);
    for (const type of allPanelTypes) {
      expect(panelRegistry.find(p => p.id === type)).toBeDefined();
    }
  });

  it('each definition has required fields', () => {
    for (const panel of panelRegistry) {
      expect(panel.id).toBeTruthy();
      expect(panel.label).toBeTruthy();
      expect(panel.component).toBeDefined();
      // shortcut is optional (e.g. dashboard has no shortcut)
    }
  });

  it('getPanelDefinition returns correct panel', () => {
    const tasks = getPanelDefinition('tasks');
    expect(tasks?.id).toBe('tasks');
    expect(tasks?.label).toBeTruthy();
  });

  it('getPanelDefinition returns undefined for unknown', () => {
    expect(getPanelDefinition('unknown' as PanelType)).toBeUndefined();
  });
});
