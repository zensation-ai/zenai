// frontend/src/components/layout/FeedbackButton.tsx
import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { FeedbackDialog } from '../FeedbackDialog';

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-[#0d1117]/80 px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:border-white/20 shadow-lg backdrop-blur-md transition-all"
        aria-label="Feedback senden"
        title="Feedback senden"
      >
        <MessageSquarePlus size={14} />
        <span className="hidden sm:inline">Feedback</span>
      </button>
      <FeedbackDialog isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
