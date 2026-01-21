-- =====================================================
-- Dual-Schema Setup für Supabase
-- PersonalAIBrain - Personal/Work Context Separation
-- =====================================================
--
-- Dieses Script erstellt zwei separate Schemas in einer Supabase-Datenbank:
-- - personal: Für private Daten
-- - work: Für arbeitsbezogene Daten
--
-- Beide Schemas haben identische Tabellen-Strukturen.
-- =====================================================

-- Schema erstellen
CREATE SCHEMA IF NOT EXISTS personal;
CREATE SCHEMA IF NOT EXISTS work;

-- Default search path setzen (optional)
-- ALTER DATABASE postgres SET search_path TO public, personal, work;

-- =====================================================
-- Helper Function: Schema Setup
-- =====================================================

-- Function um Tabellen in beiden Schemas zu erstellen
CREATE OR REPLACE FUNCTION create_dual_schema_tables()
RETURNS void AS $$
DECLARE
    schema_name text;
BEGIN
    -- Loop durch beide Schemas
    FOREACH schema_name IN ARRAY ARRAY['personal', 'work']
    LOOP
        -- Ideas Table
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.ideas (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                content TEXT NOT NULL,
                structured_content JSONB,
                category TEXT,
                tags TEXT[],
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                embedding vector(1536),
                source TEXT DEFAULT ''voice'',
                metadata JSONB DEFAULT ''{}''::jsonb
            )', schema_name);

        -- Personalization Facts Table
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.personalization_facts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                category TEXT NOT NULL,
                fact TEXT NOT NULL,
                confidence DECIMAL(3,2) DEFAULT 0.8,
                source TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )', schema_name);

        -- User Profile Table
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.user_profile (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT,
                preferences JSONB DEFAULT ''{}''::jsonb,
                settings JSONB DEFAULT ''{}''::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )', schema_name);

        -- Knowledge Graph (Relationships) Table
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.idea_relationships (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source_idea_id UUID NOT NULL,
                target_idea_id UUID NOT NULL,
                relationship_type TEXT NOT NULL,
                confidence DECIMAL(3,2) DEFAULT 0.5,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                FOREIGN KEY (source_idea_id) REFERENCES %I.ideas(id) ON DELETE CASCADE,
                FOREIGN KEY (target_idea_id) REFERENCES %I.ideas(id) ON DELETE CASCADE
            )', schema_name, schema_name, schema_name);

        -- API Keys Table (shared across contexts)
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.api_keys (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                key TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                scope TEXT[] DEFAULT ARRAY[''read''],
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_used_at TIMESTAMP WITH TIME ZONE,
                is_active BOOLEAN DEFAULT true
            )', schema_name);

        -- Indexes für Performance
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ideas_created_at ON %I.ideas(created_at DESC)',
            schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ideas_category ON %I.ideas(category)',
            schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ideas_embedding ON %I.ideas USING ivfflat (embedding vector_cosine_ops)',
            schema_name, schema_name);

        RAISE NOTICE 'Schema % setup complete', schema_name;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Execute Setup
-- =====================================================

-- Stelle sicher, dass pgvector Extension verfügbar ist
CREATE EXTENSION IF NOT EXISTS vector;

-- Erstelle alle Tabellen in beiden Schemas
SELECT create_dual_schema_tables();

-- =====================================================
-- Permissions (optional - für RLS)
-- =====================================================

-- Grant permissions auf Schemas
GRANT USAGE ON SCHEMA personal TO authenticated;
GRANT USAGE ON SCHEMA work TO authenticated;

-- Grant permissions auf alle Tabellen
DO $$
DECLARE
    schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['personal', 'work']
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', schema_name);
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO authenticated', schema_name);
    END LOOP;
END $$;

-- =====================================================
-- Row Level Security (RLS) - Optional
-- =====================================================
--
-- Hinweis: RLS kann später hinzugefügt werden, wenn User-Management implementiert wird
-- Aktuell nutzen wir API-Key basierte Authentifizierung
--

-- Cleanup Function (falls benötigt)
DROP FUNCTION IF EXISTS create_dual_schema_tables();

-- =====================================================
-- Verification
-- =====================================================

-- Zeige alle Tabellen in beiden Schemas
SELECT
    schemaname,
    tablename
FROM pg_tables
WHERE schemaname IN ('personal', 'work')
ORDER BY schemaname, tablename;

-- =====================================================
-- DONE!
-- =====================================================
--
-- Nächste Schritte:
-- 1. Führe dieses Script in Supabase SQL Editor aus
-- 2. Passe database-context.ts an, um Schema-Präfixe zu nutzen
-- 3. Migriere bestehende Daten (falls vorhanden)
--
