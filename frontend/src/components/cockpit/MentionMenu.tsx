interface MentionMenuProps {
  query: string;
  visible: boolean;
  onSelect: (contact: { name: string; id: string }) => void;
  onClose: () => void;
}

export function MentionMenu({ visible }: MentionMenuProps) {
  if (!visible) return null;
  return (
    <div className="slash-menu" style={{ padding: 12 }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: 0 }}>
        @ Erwaehnungen werden in Phase 2B implementiert.
      </p>
    </div>
  );
}
