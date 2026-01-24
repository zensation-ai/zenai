-- =====================================================
-- pg_trgm Extension für Fuzzy String Matching
-- PersonalAIBrain - Stabilisierung
-- =====================================================
--
-- PROBLEM: Die similarity() Funktion wird in duplicate-detection.ts
-- verwendet, aber die pg_trgm Extension war nie installiert.
-- Dies führte zu "Query error [personal]" bei jedem Voice-Memo.
--
-- LÖSUNG: pg_trgm Extension installieren.
--
-- =====================================================

-- Extension für Trigram-basiertes Fuzzy-String-Matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- Verification
-- =====================================================

-- Prüfe ob Extension installiert ist
SELECT
    extname AS extension,
    extversion AS version
FROM pg_extension
WHERE extname = 'pg_trgm';

-- Test der similarity() Funktion
SELECT
    similarity('Voice Memo Test', 'Voice Memo') AS test_similarity,
    'pg_trgm funktioniert!' AS status;

-- =====================================================
-- Optional: GIN Index für schnellere Fuzzy-Suche
-- =====================================================
--
-- Wenn die Duplikat-Erkennung häufig genutzt wird und die Datenbank
-- wächst, können diese Indexes die Performance verbessern:
--
-- CREATE INDEX IF NOT EXISTS idx_personal_ideas_title_trgm
-- ON personal.ideas USING GIN (title gin_trgm_ops);
--
-- CREATE INDEX IF NOT EXISTS idx_work_ideas_title_trgm
-- ON work.ideas USING GIN (title gin_trgm_ops);
--

-- =====================================================
-- DONE!
-- =====================================================
--
-- Nach Ausführung:
-- - similarity() Funktion ist verfügbar
-- - Duplikat-Erkennung in duplicate-detection.ts funktioniert
-- - "Query error [personal]" bei Voice-Memos sollte verschwinden
--
