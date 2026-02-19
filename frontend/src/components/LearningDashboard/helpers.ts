export function getSuggestionIcon(type: string): string {
  const icons: Record<string, string> = {
    topic_to_explore: '🔬',
    action_reminder: '⏰',
    connection_insight: '🔗',
    learning_opportunity: '📚',
    pattern_detected: '📊',
    focus_suggestion: '🎯',
  };
  return icons[type] || '💡';
}

export function getSuggestionLabel(type: string): string {
  const labels: Record<string, string> = {
    topic_to_explore: 'Zu erkunden',
    action_reminder: 'Erinnerung',
    connection_insight: 'Verbindung',
    learning_opportunity: 'Lernchance',
    pattern_detected: 'Muster erkannt',
    focus_suggestion: 'Fokus-Empfehlung',
  };
  return labels[type] || type;
}

export function getActivityStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'Abgeschlossen',
    no_data: 'Keine Daten',
    running: 'Läuft',
    failed: 'Fehlgeschlagen',
  };
  return labels[status] || status;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '–';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '–';
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
