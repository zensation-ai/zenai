import type { PanelProps } from '../panelRegistry';

export default function SearchPanel(_props: PanelProps) {
  return (
    <div style={{ padding: 16 }}>
      <input
        type="text"
        placeholder="Suche..."
        autoFocus
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: '#e5e5e5',
          fontSize: 14,
          outline: 'none',
        }}
      />
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 12 }}>
        Globale Suche wird in Phase 2B implementiert.
      </p>
    </div>
  );
}
