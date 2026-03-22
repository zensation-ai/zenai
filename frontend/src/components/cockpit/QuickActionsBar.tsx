import { Paperclip, Image, Mic, Plus } from 'lucide-react';
import './QuickActionsBar.css';

interface QuickActionsBarProps {
  onAttachFile: () => void;
  onUploadImage: () => void;
  onVoiceInput: () => void;
  onQuickCreate: () => void;
}

const ACTIONS = [
  { id: 'attach', icon: Paperclip, label: 'Datei anhaengen', key: 'onAttachFile' },
  { id: 'image', icon: Image, label: 'Bild hochladen', key: 'onUploadImage' },
  { id: 'voice', icon: Mic, label: 'Spracheingabe', key: 'onVoiceInput' },
  { id: 'create', icon: Plus, label: 'Schnell erstellen', key: 'onQuickCreate' },
] as const;

export function QuickActionsBar(props: QuickActionsBarProps) {
  return (
    <div className="quick-actions-bar">
      {ACTIONS.map(action => (
        <button
          key={action.id}
          className="quick-actions-bar__btn"
          onClick={props[action.key]}
          aria-label={action.label}
          title={action.label}
        >
          <action.icon size={16} />
        </button>
      ))}
    </div>
  );
}
