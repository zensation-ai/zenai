import { AutomationTemplate, TEMPLATES } from './types';

interface TemplateStepProps {
  onSelect: (template: AutomationTemplate | null) => void;
}

export function TemplateStep({ onSelect }: TemplateStepProps) {
  return (
    <div className="afm-templates">
      <p className="afm-section-intro">Wähle eine Vorlage oder starte von Grund auf neu:</p>
      <div className="afm-template-grid">
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            type="button"
            className="afm-template-card liquid-glass neuro-hover-lift"
            onClick={() => onSelect(t)}
          >
            <span className="afm-template-icon">{t.icon}</span>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
          </button>
        ))}
        <button
          type="button"
          className="afm-template-card blank liquid-glass neuro-hover-lift"
          onClick={() => onSelect(null)}
        >
          <span className="afm-template-icon">✨</span>
          <h3>Leere Automation</h3>
          <p>Starte von Grund auf neu</p>
        </button>
      </div>
    </div>
  );
}
