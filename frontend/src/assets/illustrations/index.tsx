// SVG illustration URL exports (Vite static asset imports)
// Usage as <img>:  <img src={emptyIdeas} alt="" />
// Usage as inline: use the *Component exports for currentColor theming

import emptyIdeasUrl from './empty-ideas.svg';
import emptyInboxUrl from './empty-inbox.svg';
import emptyTasksUrl from './empty-tasks.svg';
import emptyDocumentsUrl from './empty-documents.svg';
import emptyCalendarUrl from './empty-calendar.svg';
import emptyAIUrl from './empty-ai.svg';
import emptySearchUrl from './empty-search.svg';
import emptyErrorUrl from './empty-error.svg';

export {
  emptyIdeasUrl,
  emptyInboxUrl,
  emptyTasksUrl,
  emptyDocumentsUrl,
  emptyCalendarUrl,
  emptyAIUrl,
  emptySearchUrl,
  emptyErrorUrl,
};

// React SVG components — inherit currentColor from parent for theming
// Usage: <EmptyIdeas className="text-muted" width={80} height={80} />

import type { SVGProps } from 'react';

type SVGComponentProps = SVGProps<SVGSVGElement>;

const baseProps = {
  viewBox: '0 0 120 120',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function EmptyIdeas(props: SVGComponentProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...baseProps} {...props}>
      <path d="M60 30 C46 30 36 40 36 52 C36 61 41 68 48 72 L48 80 C48 82 50 84 52 84 L68 84 C70 84 72 82 72 80 L72 72 C79 68 84 61 84 52 C84 40 74 30 60 30 Z" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <line x1="52" y1="80" x2="68" y2="80" />
      <line x1="52" y1="76" x2="68" y2="76" />
      <line x1="60" y1="20" x2="60" y2="14" />
      <line x1="72" y1="25" x2="76" y2="21" />
      <line x1="48" y1="25" x2="44" y2="21" />
      <line x1="78" y1="36" x2="84" y2="34" />
      <line x1="42" y1="36" x2="36" y2="34" />
    </svg>
  );
}

export function EmptyInbox(props: SVGComponentProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...baseProps} {...props}>
      <rect x="22" y="38" width="76" height="54" rx="3" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <path d="M22 38 L60 62" />
      <path d="M98 38 L60 62" />
      <path d="M22 38 L22 32 C22 30 24 28 26 28 L56 28" />
      <path d="M98 38 L98 32 C98 30 96 28 94 28 L64 28" />
      <path d="M56 28 C57 22 63 22 64 28" />
      <line x1="40" y1="72" x2="60" y2="72" strokeOpacity={0.4} />
      <line x1="40" y1="80" x2="54" y2="80" strokeOpacity={0.4} />
    </svg>
  );
}

export function EmptyTasks(props: SVGComponentProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...baseProps} {...props}>
      <rect x="30" y="32" width="60" height="72" rx="4" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <rect x="46" y="26" width="28" height="14" rx="3" />
      <rect x="53" y="29" width="14" height="6" rx="2" />
      <rect x="40" y="54" width="10" height="10" rx="2" />
      <line x1="58" y1="59" x2="76" y2="59" />
      <rect x="40" y="72" width="10" height="10" rx="2" />
      <line x1="58" y1="77" x2="76" y2="77" />
      <rect x="40" y="90" width="10" height="10" rx="2" />
      <line x1="58" y1="95" x2="70" y2="95" />
    </svg>
  );
}

export function EmptyDocuments(props: SVGComponentProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...baseProps} {...props}>
      <path d="M24 46 L24 44 C24 42 26 40 28 40 L50 40 L56 34 L92 34 C94 34 96 36 96 38 L96 46" fill="currentColor" fillOpacity={0.03} stroke="currentColor" />
      <path d="M20 46 C18 46 16 48 16 50 L16 86 C16 88 18 90 20 90 L100 90 C102 90 104 88 104 86 L104 50 C104 48 102 46 100 46 Z" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <path d="M20 46 L38 46" />
      <path d="M70 46 L100 46" />
      <path d="M38 46 C40 38 68 38 70 46" />
      <line x1="38" y1="65" x2="82" y2="65" strokeOpacity={0.35} />
      <line x1="38" y1="74" x2="70" y2="74" strokeOpacity={0.35} />
    </svg>
  );
}

export function EmptyCalendar(props: SVGComponentProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...baseProps} {...props}>
      <rect x="18" y="30" width="84" height="74" rx="5" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <line x1="18" y1="48" x2="102" y2="48" />
      <line x1="38" y1="22" x2="38" y2="38" />
      <line x1="82" y1="22" x2="82" y2="38" />
      <rect x="26" y="56" width="16" height="12" rx="2" strokeOpacity={0.5} />
      <rect x="52" y="56" width="16" height="12" rx="2" strokeOpacity={0.5} />
      <rect x="78" y="56" width="16" height="12" rx="2" strokeOpacity={0.5} />
      <rect x="26" y="74" width="16" height="12" rx="2" strokeOpacity={0.5} />
      <rect x="52" y="74" width="16" height="12" rx="2" strokeOpacity={0.5} />
      <rect x="78" y="74" width="16" height="12" rx="2" strokeOpacity={0.5} />
      <rect x="26" y="92" width="16" height="6" rx="2" strokeOpacity={0.3} />
      <rect x="52" y="92" width="16" height="6" rx="2" strokeOpacity={0.3} />
    </svg>
  );
}

export function EmptyAI(props: SVGComponentProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...baseProps} {...props}>
      <circle cx="60" cy="60" r="10" fill="currentColor" fillOpacity={0.08} stroke="currentColor" />
      <circle cx="28" cy="36" r="8" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <circle cx="92" cy="36" r="8" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <circle cx="60" cy="92" r="8" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <line x1="51" y1="53" x2="35" y2="42" />
      <line x1="69" y1="53" x2="85" y2="42" />
      <line x1="60" y1="70" x2="60" y2="84" />
      <line x1="36" y1="36" x2="84" y2="36" />
      <circle cx="43" cy="47" r="2" fill="currentColor" stroke="none" />
      <circle cx="77" cy="47" r="2" fill="currentColor" stroke="none" />
      <circle cx="60" cy="77" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EmptySearch(props: SVGComponentProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...baseProps} {...props}>
      <circle cx="50" cy="50" r="26" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <line x1="69" y1="69" x2="90" y2="90" />
      <circle cx="50" cy="50" r="10" strokeOpacity={0.4} />
      <line x1="44" y1="44" x2="56" y2="56" strokeOpacity={0.6} />
      <line x1="56" y1="44" x2="44" y2="56" strokeOpacity={0.6} />
    </svg>
  );
}

export function EmptyError(props: SVGComponentProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...baseProps} {...props}>
      <path d="M34 60 C26 60 20 54 20 46 C20 38 26 32 34 32 C34 32 36 24 44 22 C52 20 60 26 62 32 C64 30 68 28 72 28 C80 28 86 34 86 42 C90 42 96 46 96 52 C96 58 90 62 84 62 Z" fill="currentColor" fillOpacity={0.05} stroke="currentColor" />
      <path d="M34 60 C34 60 34 62 36 62 L82 62 C84 62 84 60 84 60" />
      <polyline points="58,72 52,84 62,84 54,98" />
    </svg>
  );
}
