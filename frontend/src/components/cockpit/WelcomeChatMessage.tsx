import './WelcomeChatMessage.css';

interface WelcomeChatMessageProps {
  onSendMessage: (message: string) => void;
  onOpenCommandPalette: () => void;
}

const MESSAGE_CHIPS = [
  'Zeig mir meine Aufgaben',
  'Schreib eine Email',
  'Was habe ich heute gelernt?',
] as const;

export function WelcomeChatMessage({ onSendMessage, onOpenCommandPalette }: WelcomeChatMessageProps) {
  return (
    <div className="welcome-chat-message">
      <div className="welcome-chat-message__icon" aria-hidden="true">
        🧠
      </div>
      <h2 className="welcome-chat-message__heading">Willkommen bei ZenAI</h2>
      <p className="welcome-chat-message__subtitle">
        Ich bin dein persönlicher KI-Assistent. Wie kann ich dir heute helfen?
      </p>
      <div className="welcome-chat-message__chips" role="list" aria-label="Vorschläge">
        {MESSAGE_CHIPS.map((chip) => (
          <button
            key={chip}
            className="welcome-chat-message__chip"
            onClick={() => onSendMessage(chip)}
            role="listitem"
            type="button"
          >
            {chip}
          </button>
        ))}
        <button
          className="welcome-chat-message__chip welcome-chat-message__chip--palette"
          onClick={onOpenCommandPalette}
          role="listitem"
          type="button"
        >
          ⌘ alle Befehle anzeigen
        </button>
      </div>
    </div>
  );
}
