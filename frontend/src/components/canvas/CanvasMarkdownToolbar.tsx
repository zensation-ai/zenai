/**
 * Canvas Markdown Toolbar
 *
 * Inline formatting toolbar for markdown editing.
 * Inserts markdown syntax at cursor position in the textarea.
 *
 * Phase 6.2 - Multi-Modal Canvas Enhancement
 */

interface CanvasMarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onContentChange: (content: string) => void;
  content: string;
  disabled?: boolean;
}

interface ToolbarAction {
  label: string;
  icon: string;
  title: string;
  prefix: string;
  suffix: string;
  placeholder: string;
  block?: boolean;
  className?: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: 'B', icon: 'B', title: 'Fett (Ctrl+B)', prefix: '**', suffix: '**', placeholder: 'fett', className: 'bold' },
  { label: 'I', icon: 'I', title: 'Kursiv (Ctrl+I)', prefix: '_', suffix: '_', placeholder: 'kursiv', className: 'italic' },
  { label: 'Code', icon: '`', title: 'Inline Code', prefix: '`', suffix: '`', placeholder: 'code' },
  { label: 'Link', icon: '\uD83D\uDD17', title: 'Link', prefix: '[', suffix: '](url)', placeholder: 'Link-Text' },
  { label: 'Bild', icon: '\uD83D\uDDBC\uFE0F', title: 'Bild einfuegen', prefix: '![', suffix: '](url)', placeholder: 'Bildbeschreibung' },
  { label: 'Mermaid', icon: '\u25C8', title: 'Mermaid-Diagramm', prefix: '```mermaid\n', suffix: '\n```', placeholder: 'graph TD\n    A[Start] --> B[Ende]', block: true },
];

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  content: string,
  action: ToolbarAction,
  onContentChange: (content: string) => void
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = content.substring(start, end);
  const textToInsert = selectedText || action.placeholder;

  let newContent: string;
  let cursorStart: number;
  let cursorEnd: number;

  if (action.block) {
    // For block-level inserts, ensure we're on a new line
    const beforeCursor = content.substring(0, start);
    const needsNewlineBefore = beforeCursor.length > 0 && !beforeCursor.endsWith('\n');
    const prefix = (needsNewlineBefore ? '\n' : '') + action.prefix;

    newContent = content.substring(0, start) + prefix + textToInsert + action.suffix + content.substring(end);
    cursorStart = start + prefix.length;
    cursorEnd = cursorStart + textToInsert.length;
  } else {
    newContent = content.substring(0, start) + action.prefix + textToInsert + action.suffix + content.substring(end);
    cursorStart = start + action.prefix.length;
    cursorEnd = cursorStart + textToInsert.length;
  }

  onContentChange(newContent);

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.selectionStart = cursorStart;
    textarea.selectionEnd = cursorEnd;
  });
}

export function CanvasMarkdownToolbar({
  textareaRef,
  onContentChange,
  content,
  disabled = false,
}: CanvasMarkdownToolbarProps) {
  const handleAction = (action: ToolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) return;
    insertAtCursor(textarea, content, action, onContentChange);
  };

  return (
    <div className="canvas-md-toolbar" role="toolbar" aria-label="Formatierung">
      {TOOLBAR_ACTIONS.map((action) => (
        <button
          key={action.label}
          className={`canvas-md-toolbar-btn${action.className ? ` ${action.className}` : ''}`}
          onClick={() => handleAction(action)}
          title={action.title}
          aria-label={action.title}
          disabled={disabled}
          type="button"
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
}
