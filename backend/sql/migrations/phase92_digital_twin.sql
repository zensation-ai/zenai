-- Phase 92: Digital Twin Profile
-- Creates tables for user Digital Twin in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Digital Twin profile sections
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.digital_twin_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        section VARCHAR(50) NOT NULL,
        data JSONB NOT NULL DEFAULT ''{}''::jsonb,
        confidence FLOAT DEFAULT 0.5,
        source VARCHAR(50),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_dtp_user_section ON %I.digital_twin_profiles (user_id, section)
    ', schema_name);

    -- Digital Twin weekly snapshots
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.digital_twin_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        snapshot JSONB NOT NULL,
        radar_scores JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_dts_user_created ON %I.digital_twin_snapshots (user_id, created_at DESC)
    ', schema_name);

    -- Digital Twin corrections ("AI is wrong about...")
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.digital_twin_corrections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        section VARCHAR(50) NOT NULL,
        original_value JSONB,
        corrected_value JSONB,
        reason TEXT,
        applied BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_dtc_user_section ON %I.digital_twin_corrections (user_id, section)
    ', schema_name);
  END LOOP;
END $$;
