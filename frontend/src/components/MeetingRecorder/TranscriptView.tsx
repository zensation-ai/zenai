/**
 * TranscriptView — renders a scrollable list of timestamped transcript entries.
 * Used inside MeetingRecorder to display the live meeting transcript.
 */

import { useEffect, useRef } from 'react';

export interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp: string | Date;
}

interface TranscriptViewProps {
  entries: TranscriptEntry[];
}

function formatTime(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TranscriptView({ entries }: TranscriptViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm rounded-lg border border-dashed border-gray-700">
        No transcript yet — start recording to capture speech.
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-64 rounded-lg border border-gray-700 bg-gray-900/50 p-3 space-y-2">
      {entries.map((entry, idx) => (
        <div key={idx} className="flex gap-3 text-sm">
          <span className="shrink-0 text-gray-500 font-mono text-xs pt-0.5 w-20">
            {formatTime(entry.timestamp)}
          </span>
          <div className="min-w-0">
            <span className="font-semibold text-indigo-400 mr-2">{entry.speaker}:</span>
            <span className="text-gray-200">{entry.text}</span>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
