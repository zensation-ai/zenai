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
      <p className="panel-loading" style={{ margin: 0 }}>
        @ Erwaehnungen — kommt bald.
      </p>
    </div>
  );
}
