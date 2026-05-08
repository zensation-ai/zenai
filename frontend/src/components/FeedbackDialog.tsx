// frontend/src/components/FeedbackDialog.tsx
import { useState } from 'react';
import { X, Bug, Lightbulb, HelpCircle, MessageSquare, Send } from 'lucide-react';
import axios from 'axios';

type Category = 'bug' | 'feature' | 'question' | 'other';

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'bug', label: 'Fehler melden', icon: <Bug size={16} />, desc: 'Etwas funktioniert nicht' },
  { id: 'feature', label: 'Feature-Wunsch', icon: <Lightbulb size={16} />, desc: 'Idee für Verbesserung' },
  { id: 'question', label: 'Frage', icon: <HelpCircle size={16} />, desc: 'Ich brauche Hilfe' },
  { id: 'other', label: 'Sonstiges', icon: <MessageSquare size={16} />, desc: 'Anderes Feedback' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackDialog({ isOpen, onClose }: Props) {
  const [category, setCategory] = useState<Category>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setStatus('sending');
    try {
      await axios.post('/api/feedback', {
        category,
        title: title.trim(),
        description: description.trim(),
        url: window.location.pathname,
      });
      setStatus('sent');
      setTimeout(() => {
        onClose();
        setStatus('idle');
        setTitle('');
        setDescription('');
      }, 1500);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-end p-6 pointer-events-none">
      <div className="w-96 rounded-2xl border border-white/10 bg-bg/98 shadow-2xl backdrop-blur-xl pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <p className="text-sm font-semibold text-white">Feedback senden</p>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
            aria-label="Dialog schließen"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Category */}
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition-all ${
                  category === c.id
                    ? 'bg-primary/20 border border-primary/40 text-primary'
                    : 'border border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                }`}
              >
                {c.icon}
                <span className="font-medium">{c.label}</span>
              </button>
            ))}
          </div>

          {/* Title */}
          <input
            type="text"
            placeholder="Kurze Zusammenfassung"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-primary/50 focus:outline-none"
          />

          {/* Description */}
          <textarea
            placeholder="Details beschreiben..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            required
            rows={4}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-primary/50 focus:outline-none resize-none"
          />

          {/* Submit */}
          {status === 'sent' ? (
            <p className="text-center text-sm text-primary">✓ Danke für dein Feedback!</p>
          ) : (
            <button
              type="submit"
              disabled={status === 'sending' || !title.trim() || !description.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 transition-all"
            >
              <Send size={14} />
              {status === 'sending' ? 'Sende...' : 'Absenden'}
            </button>
          )}
          {status === 'error' && (
            <p className="text-center text-xs text-red-400">Fehler beim Senden. Bitte versuche es erneut.</p>
          )}
        </form>
      </div>
    </div>
  );
}
