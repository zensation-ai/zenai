-- =====================================================
-- Fix: API Keys in Public Schema
-- PersonalAIBrain - Issue #24 Follow-up
-- =====================================================
--
-- PROBLEM: Die Schema-Migration hat api_keys in personal/work
--          Schemas erstellt, aber das Auth-Middleware erwartet
--          die Tabelle im public Schema (default search_path).
--
-- SOLUTION: Erstelle eine zentrale api_keys Tabelle in public,
--           da API Keys context-übergreifend sein sollten.
--
-- =====================================================

-- Drop alte api_keys aus personal/work (falls vorhanden)
DROP TABLE IF EXISTS personal.api_keys CASCADE;
DROP TABLE IF EXISTS work.api_keys CASCADE;

-- Erstelle zentrale api_keys Tabelle in public Schema
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_prefix VARCHAR(10) NOT NULL,
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    scopes TEXT[] DEFAULT ARRAY['read'],
    rate_limit INTEGER DEFAULT 1000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON public.api_keys(is_active, expires_at);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- Helper Function: API Key generieren
-- =====================================================

CREATE OR REPLACE FUNCTION generate_api_key_hash(api_key TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Placeholder für SHA256 - Backend nutzt bcrypt
    -- Diese Funktion ist nur für manuelle Key-Erstellung
    RETURN encode(digest(api_key, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Initial API Key für Frontend
-- =====================================================
--
-- WICHTIG: Der Key-Hash muss mit bcrypt im Backend generiert werden!
-- Dieser Eintrag ist ein PLACEHOLDER und MUSS durch den Backend-generierten ersetzt werden.
--
-- Zum Generieren eines korrekten Keys:
-- 1. POST /api/keys mit Admin-Rechten
-- 2. Oder Backend-Script: npm run generate-api-key
--

-- Beispiel-Insert (MUSS durch echten bcrypt-Hash ersetzt werden!)
-- INSERT INTO public.api_keys (key_prefix, key_hash, name, scopes, rate_limit)
-- VALUES (
--     'ab_live_79',  -- Prefix des Frontend Keys
--     '$2b$12$...', -- bcrypt hash (vom Backend generiert)
--     'Frontend Production Key',
--     ARRAY['read', 'write'],
--     10000
-- );

-- =====================================================
-- Verification
-- =====================================================

-- Zeige alle API Keys
SELECT
    id,
    key_prefix,
    name,
    scopes,
    rate_limit,
    is_active,
    created_at,
    last_used_at,
    expires_at
FROM public.api_keys
ORDER BY created_at DESC;

-- =====================================================
-- DONE!
-- =====================================================
--
-- Nächste Schritte:
-- 1. Führe dieses Script in Supabase SQL Editor aus
-- 2. Generiere API Key im Backend: POST /api/keys
-- 3. Oder nutze generate-api-key.ts Script
-- 4. Teste Authentifizierung mit neuem Key
--
