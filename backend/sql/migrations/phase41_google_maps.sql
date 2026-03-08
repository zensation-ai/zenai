-- Phase 41: Google Maps Integration
-- Adds geolocation fields to calendar_events and creates location cache tables
-- Runs across all 4 schemas: personal, work, learning, creative

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- 1. Add geolocation columns to calendar_events
    EXECUTE format('
      ALTER TABLE %I.calendar_events
        ADD COLUMN IF NOT EXISTS location_lat DECIMAL(9,6),
        ADD COLUMN IF NOT EXISTS location_lng DECIMAL(9,6),
        ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS location_formatted VARCHAR(500)
    ', s);

    -- 2. Create geocoding_cache table (shared across events)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.geocoding_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        address_query VARCHAR(500) NOT NULL,
        formatted_address VARCHAR(500),
        lat DECIMAL(9,6) NOT NULL,
        lng DECIMAL(9,6) NOT NULL,
        google_place_id VARCHAR(255),
        address_components JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL ''30 days''),
        UNIQUE(address_query)
      )
    ', s);

    -- 3. Create places_cache table (opening hours, details)
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.places_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        google_place_id VARCHAR(255) NOT NULL,
        name VARCHAR(500),
        formatted_address VARCHAR(500),
        lat DECIMAL(9,6),
        lng DECIMAL(9,6),
        types JSONB,
        opening_hours JSONB,
        phone VARCHAR(50),
        website VARCHAR(500),
        rating DECIMAL(2,1),
        price_level INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL ''24 hours''),
        UNIQUE(google_place_id)
      )
    ', s);

    -- 4. Create saved_locations table for user-specific saved places
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.saved_locations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL,
        label VARCHAR(100) NOT NULL,
        address VARCHAR(500) NOT NULL,
        lat DECIMAL(9,6) NOT NULL,
        lng DECIMAL(9,6) NOT NULL,
        google_place_id VARCHAR(255),
        icon VARCHAR(10) DEFAULT ''pin'',
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    ', s);

    -- 5. Indexes
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_events_location_coords
        ON %I.calendar_events(location_lat, location_lng)
        WHERE location_lat IS NOT NULL
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_geocoding_cache_query
        ON %I.geocoding_cache(address_query)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_geocoding_cache_expires
        ON %I.geocoding_cache(expires_at)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_places_cache_place_id
        ON %I.places_cache(google_place_id)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_places_cache_expires
        ON %I.places_cache(expires_at)
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_saved_locations_context
        ON %I.saved_locations(context)
    ', s, s);

  END LOOP;
END $$;
