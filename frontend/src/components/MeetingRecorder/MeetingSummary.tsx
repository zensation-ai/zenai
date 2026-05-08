/**
 * MeetingSummary — displays the AI-generated meeting summary with structured sections.
 *
 * Shows: overall summary text, action items, decisions, and key points.
 * Designed to be rendered after a meeting session ends.
 */

import { ClipboardList, CheckSquare, Scale, Lightbulb } from 'lucide-react';

export interface MeetingSummaryData {
  summary: string;
  actionItems: string[];
  decisions: string[];
  keyPoints: string[];
}

interface MeetingSummaryProps {
  data: MeetingSummaryData;
  meetingId?: string;
  className?: string;
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  items: string[];
  accentClass: string;
  dotClass: string;
}

function Section({ icon, title, items, accentClass, dotClass }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className={`flex items-center gap-2 text-sm font-semibold ${accentClass}`}>
        {icon}
        {title}
      </h4>
      <ul className="space-y-1.5 pl-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MeetingSummary({ data, className = '' }: MeetingSummaryProps) {
  const { summary, actionItems, decisions, keyPoints } = data;

  return (
    <div className={`rounded-xl border border-gray-700 bg-gray-900 p-5 space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-700 pb-4">
        <ClipboardList className="w-5 h-5 text-indigo-400 shrink-0" />
        <h3 className="text-base font-semibold text-white">Meeting-Zusammenfassung</h3>
      </div>

      {/* Summary text */}
      {summary && (
        <p className="text-sm text-gray-300 leading-relaxed">{summary}</p>
      )}

      {/* Action items */}
      <Section
        icon={<CheckSquare className="w-4 h-4" />}
        title="Aktionspunkte"
        items={actionItems}
        accentClass="text-emerald-400"
        dotClass="bg-emerald-400"
      />

      {/* Decisions */}
      <Section
        icon={<Scale className="w-4 h-4" />}
        title="Entscheidungen"
        items={decisions}
        accentClass="text-amber-400"
        dotClass="bg-amber-400"
      />

      {/* Key points */}
      <Section
        icon={<Lightbulb className="w-4 h-4" />}
        title="Kernpunkte"
        items={keyPoints}
        accentClass="text-blue-400"
        dotClass="bg-blue-400"
      />

      {/* Empty state */}
      {actionItems.length === 0 && decisions.length === 0 && keyPoints.length === 0 && !summary && (
        <p className="text-sm text-gray-500 text-center py-4">
          Keine strukturierten Informationen extrahiert.
        </p>
      )}
    </div>
  );
}
