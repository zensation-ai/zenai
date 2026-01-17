-- Context Signals Table
-- Tracks signals from various sources for learning and personalization

CREATE TABLE IF NOT EXISTS context_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),
  signal_type VARCHAR(50) NOT NULL CHECK (signal_type IN ('idea', 'meeting', 'slack', 'calendar', 'feedback', 'correction')),
  signal_data JSONB NOT NULL DEFAULT '{}',
  extracted_insights JSONB DEFAULT NULL,
  applied_to_profile BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_context_signals_context ON context_signals(context);
CREATE INDEX IF NOT EXISTS idx_context_signals_type ON context_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_context_signals_applied ON context_signals(applied_to_profile);
CREATE INDEX IF NOT EXISTS idx_context_signals_created ON context_signals(created_at DESC);

-- Comment
COMMENT ON TABLE context_signals IS 'Stores signals from various sources (ideas, meetings, integrations) for learning and profile updates';
