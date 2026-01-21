-- =====================================================
-- Context Field Migration
-- PersonalAIBrain - Fix for NULL context values
-- =====================================================
--
-- PROBLEM: All existing ideas have context = NULL
--          Should be 'personal' or 'work' based on schema
--
-- SOLUTION: Set context field based on schema location
--
-- =====================================================

-- Backup erstellen (sicherheitshalber)
CREATE TABLE IF NOT EXISTS personal.ideas_backup_20260121 AS
SELECT * FROM personal.ideas;

CREATE TABLE IF NOT EXISTS work.ideas_backup_20260121 AS
SELECT * FROM work.ideas;

-- Personal Schema: Set context to 'personal'
UPDATE personal.ideas
SET context = 'personal'
WHERE context IS NULL;

-- Work Schema: Set context to 'work'
UPDATE work.ideas
SET context = 'work'
WHERE context IS NULL;

-- Verification: Check counts
SELECT 'personal' as schema, COUNT(*) as total, COUNT(*) FILTER (WHERE context = 'personal') as with_context
FROM personal.ideas
UNION ALL
SELECT 'work' as schema, COUNT(*) as total, COUNT(*) FILTER (WHERE context = 'work') as with_context
FROM work.ideas;

-- Optional: Add NOT NULL constraint (nach Verification)
-- ALTER TABLE personal.ideas ALTER COLUMN context SET NOT NULL;
-- ALTER TABLE work.ideas ALTER COLUMN context SET NOT NULL;

-- =====================================================
-- DONE!
-- =====================================================
--
-- Nach Ausführung:
-- 1. Prüfe Verification Output
-- 2. Falls alles korrekt: NOT NULL Constraint aktivieren
-- 3. Backups können nach 30 Tagen gelöscht werden
--
