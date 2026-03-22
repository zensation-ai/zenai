/**
 * German Error Messages for Production
 *
 * Maps error codes to user-friendly German messages.
 * Used by the error handler middleware in production to avoid
 * exposing internal error details.
 *
 * @module utils/error-messages-de
 */

export const ERROR_MESSAGES_DE: Record<string, string> = {
  NETWORK_ERROR: 'Verbindung zum Server unterbrochen. Bitte Internetverbindung pruefen.',
  AI_UNAVAILABLE: 'KI voruebergehend nicht erreichbar. Bitte in einer Minute erneut versuchen.',
  RATE_LIMIT: 'Zu viele Anfragen. Bitte kurz warten.',
  RATE_LIMIT_EXCEEDED: 'Zu viele Anfragen. Bitte kurz warten.',
  NOT_FOUND: 'Die angeforderte Ressource wurde nicht gefunden.',
  VALIDATION_ERROR: 'Die Eingabe ist ungueltig. Bitte ueberpruefen.',
  INVALID_UUID: 'Ungueltige ID. Bitte ueberpruefen.',
  INVALID_CONTEXT: 'Ungueltige Kontextangabe.',
  INVALID_JSON: 'Die Anfrage enthaelt ungueltiges JSON.',
  DATABASE_ERROR: 'Datenbankfehler. Bitte spaeter erneut versuchen.',
  SCHEMA_ERROR: 'Datenbankfehler. Bitte spaeter erneut versuchen.',
  DUPLICATE_ENTRY: 'Dieser Eintrag existiert bereits.',
  REFERENCE_ERROR: 'Die referenzierte Ressource existiert nicht.',
  GATEWAY_TIMEOUT: 'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.',
  UNAUTHORIZED: 'Nicht autorisiert. Bitte erneut anmelden.',
  INVALID_API_KEY: 'Ungueltiger API-Schluessel.',
  FORBIDDEN: 'Keine Berechtigung fuer diese Aktion.',
  CONFLICT: 'Konflikt mit bestehenden Daten.',
  TOOL_ERROR: 'Ein Werkzeug konnte nicht ausgefuehrt werden.',
  STREAMING_ERROR: 'Fehler bei der Echtzeit-Verbindung.',
  CIRCUIT_OPEN: 'Der Dienst ist voruebergehend nicht erreichbar.',
  SERVICE_UNAVAILABLE: 'Der Dienst ist voruebergehend nicht verfuegbar. Bitte spaeter erneut versuchen.',
  EXTERNAL_SERVICE_ERROR: 'Ein externer Dienst ist nicht erreichbar.',
  WHISPER_ERROR: 'Spracherkennung nicht verfuegbar.',
  OLLAMA_ERROR: 'Lokale KI nicht erreichbar.',
  INTERNAL_ERROR: 'Ein unerwarteter Fehler ist aufgetreten.',
};

/**
 * Returns a user-friendly German error message for the given error code.
 * Falls back to INTERNAL_ERROR message if the code is not found.
 */
export function getGermanErrorMessage(code: string): string {
  return ERROR_MESSAGES_DE[code] ?? (ERROR_MESSAGES_DE['INTERNAL_ERROR'] || 'Ein interner Fehler ist aufgetreten.');
}
