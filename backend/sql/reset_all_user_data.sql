-- ==============================================
-- ZenAI - Reset All User Data
-- Loescht alle Testdaten, behaelt System-Konfigurationen
-- ==============================================

-- WARNUNG: Dieses Script loescht alle Benutzerdaten!
-- Ausfuehrung nur in Supabase SQL Editor

BEGIN;

-- 1. Chat Messages und Sessions (abhaengige Tabellen zuerst)
TRUNCATE TABLE general_chat_messages CASCADE;
TRUNCATE TABLE general_chat_sessions CASCADE;

TRUNCATE TABLE chat_messages CASCADE;
TRUNCATE TABLE personalization_sessions CASCADE;

TRUNCATE TABLE conversation_sessions CASCADE;

-- 2. Ideas und zugehoerige Daten
TRUNCATE TABLE idea_topic_memberships CASCADE;
TRUNCATE TABLE idea_relations CASCADE;
TRUNCATE TABLE ideas CASCADE;
TRUNCATE TABLE idea_topics CASCADE;

-- 3. Incubator
TRUNCATE TABLE loose_thoughts CASCADE;
TRUNCATE TABLE thought_clusters CASCADE;

-- 4. Voice Memos
TRUNCATE TABLE voice_memos CASCADE;

-- 5. Training & Patterns
TRUNCATE TABLE user_training CASCADE;
TRUNCATE TABLE pattern_predictions CASCADE;
TRUNCATE TABLE interaction_history CASCADE;

-- 6. Media
TRUNCATE TABLE media_items CASCADE;

-- 7. Analytics & Events
TRUNCATE TABLE analytics_events CASCADE;
TRUNCATE TABLE user_action_log CASCADE;

-- 8. Notifications (Historie, nicht Einstellungen)
TRUNCATE TABLE notification_history CASCADE;

-- 9. Digests
TRUNCATE TABLE digests CASCADE;

-- 10. User Goals
TRUNCATE TABLE user_goals CASCADE;

-- 11. Proactive Suggestions
TRUNCATE TABLE proactive_suggestion_feedback CASCADE;
TRUNCATE TABLE routine_patterns CASCADE;

-- 12. Personalization Facts (Long-Term Memory)
TRUNCATE TABLE personalization_facts CASCADE;

-- Beibehalten werden:
-- - user_profile (Benutzereinstellungen)
-- - notification_preferences (Benachrichtigungseinstellungen)
-- - proactive_settings (KI-Proaktivitaet)
-- - productivity_goals (Produktivitaetsziele)
-- - push_tokens (Geraete-Registrierungen)

COMMIT;

-- Bestaetigung
SELECT 'Alle Benutzerdaten wurden erfolgreich geloescht.' AS status;
