-- ===========================================
-- Phase: Intelligent Learning System
-- Proaktives Lernen, Fokus-Themen, Auto-Recherche
-- ===========================================

-- 1. Domain Focus: Themen, auf die sich die KI konzentrieren soll
CREATE TABLE IF NOT EXISTS domain_focus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),
  user_id VARCHAR(100) DEFAULT 'default',

  -- Fokus-Definition
  name VARCHAR(100) NOT NULL,
  description TEXT,
  keywords TEXT[] DEFAULT '{}',

  -- Wissensquellen
  document_sources JSONB DEFAULT '[]',  -- URLs, Dateipfade, etc.
  api_connections JSONB DEFAULT '[]',   -- SAP, externe APIs

  -- Lernziele
  learning_goals TEXT[] DEFAULT '{}',

  -- Aktivität
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5,  -- 1-10, höher = wichtiger

  -- Statistiken
  ideas_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE,

  -- Embedding für semantische Suche
  focus_embedding vector(768),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Proaktive Recherchen: KI bereitet automatisch Informationen vor
CREATE TABLE IF NOT EXISTS proactive_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Auslöser
  trigger_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  trigger_type VARCHAR(50) NOT NULL CHECK (
    trigger_type IN ('task_research', 'question', 'topic_interest', 'scheduled', 'manual')
  ),
  trigger_text TEXT,  -- Der erkannte Recherche-Bedarf

  -- Recherche-Ergebnis
  research_query TEXT NOT NULL,
  research_results JSONB DEFAULT '[]',  -- Array von Quellen + Zusammenfassungen
  summary TEXT,  -- KI-generierte Zusammenfassung
  key_insights TEXT[] DEFAULT '{}',

  -- Teaser für den Nutzer
  teaser_title VARCHAR(255),
  teaser_text TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (
    status IN ('pending', 'researching', 'completed', 'failed', 'viewed', 'dismissed')
  ),

  -- Qualität
  confidence_score FLOAT DEFAULT 0,
  user_rating INTEGER,  -- 1-5 Sterne vom Nutzer
  was_helpful BOOLEAN,

  -- Timing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  viewed_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE
);

-- 3. KI-Antwort-Feedback: Lernen aus Korrekturen
CREATE TABLE IF NOT EXISTS ai_response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Referenz
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  response_type VARCHAR(50) NOT NULL,  -- 'structuring', 'suggestion', 'research', 'summary'

  -- Original KI-Antwort (TEXT statt JSONB für einfachere Handhabung)
  original_response TEXT,

  -- Nutzer-Feedback
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  correction TEXT,  -- Korrigierte Antwort
  feedback_text TEXT,  -- Optionaler Feedback-Text

  -- Embedding für Ähnlichkeitssuche
  correction_embedding vector(768),

  -- Lernstatus
  applied_to_learning BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Business-Profil: Verständnis für den Nutzer und sein Business
CREATE TABLE IF NOT EXISTS business_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),
  user_id VARCHAR(100) DEFAULT 'default',

  -- Grundinformationen
  company_name VARCHAR(255),
  industry VARCHAR(100),
  company_size VARCHAR(50),  -- 'solo', 'small', 'medium', 'enterprise'
  role VARCHAR(100),  -- Rolle des Nutzers

  -- Business-Kontext
  main_products_services TEXT[] DEFAULT '{}',
  target_customers TEXT[] DEFAULT '{}',
  key_partners TEXT[] DEFAULT '{}',
  tech_stack TEXT[] DEFAULT '{}',

  -- Arbeitsweise
  communication_style VARCHAR(50),  -- 'formal', 'casual', 'mixed'
  decision_making_style VARCHAR(50),  -- 'data_driven', 'intuitive', 'collaborative'
  preferred_meeting_types TEXT[] DEFAULT '{}',

  -- Wichtige Themen (gelernt)
  recurring_topics JSONB DEFAULT '{}',  -- topic -> frequency
  pain_points TEXT[] DEFAULT '{}',
  goals TEXT[] DEFAULT '{}',

  -- KI-gelernte Insights
  learned_patterns JSONB DEFAULT '{}',
  personality_traits JSONB DEFAULT '{}',

  -- Embedding für Kontext-Matching
  profile_embedding vector(768),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(context, user_id)
);

-- 5. Tägliches Lernen: Was die KI jeden Tag gelernt hat
CREATE TABLE IF NOT EXISTS daily_learning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),
  learning_date DATE NOT NULL,

  -- Was wurde gelernt
  new_patterns JSONB DEFAULT '[]',
  updated_preferences JSONB DEFAULT '[]',
  new_keywords TEXT[] DEFAULT '{}',

  -- Aus welchen Quellen
  ideas_analyzed INTEGER DEFAULT 0,
  corrections_processed INTEGER DEFAULT 0,
  feedback_processed INTEGER DEFAULT 0,

  -- KI-Zusammenfassung des Tages
  daily_summary TEXT,
  key_learnings TEXT[] DEFAULT '{}',

  -- Vorschläge für den nächsten Tag
  suggestions_for_tomorrow TEXT[] DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(context, learning_date)
);

-- 6. KI-Vorschläge: Proaktive Empfehlungen
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Art des Vorschlags
  suggestion_type VARCHAR(50) NOT NULL CHECK (
    suggestion_type IN (
      'topic_to_explore',      -- "Du solltest dich mit X beschäftigen"
      'connection_found',       -- "Diese Ideen hängen zusammen"
      'action_reminder',        -- "Diese Aufgabe wartet seit X Tagen"
      'pattern_insight',        -- "Ich habe bemerkt, dass du oft..."
      'optimization',           -- "Dein Workflow könnte verbessert werden"
      'research_opportunity',   -- "Zu diesem Thema gibt es Neues"
      'business_insight'        -- "Basierend auf deinem Business..."
    )
  ),

  -- Inhalt
  title VARCHAR(255) NOT NULL,
  description TEXT,
  reasoning TEXT,  -- Warum schlägt die KI das vor?

  -- Kontext
  related_ideas UUID[] DEFAULT '{}',
  related_focus_id UUID REFERENCES domain_focus(id) ON DELETE SET NULL,

  -- Priorisierung
  priority INTEGER DEFAULT 5,  -- 1-10
  confidence_score FLOAT DEFAULT 0.5,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (
    status IN ('pending', 'shown', 'accepted', 'dismissed', 'completed')
  ),

  -- Nutzer-Reaktion
  user_response VARCHAR(50),  -- 'helpful', 'not_relevant', 'already_knew', 'will_do_later'
  user_feedback TEXT,

  -- Timing
  show_after TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  shown_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE
);

-- 7. Recherche-Patterns: Was löst automatische Recherche aus
CREATE TABLE IF NOT EXISTS research_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Pattern-Definition
  pattern_name VARCHAR(100) NOT NULL,
  pattern_type VARCHAR(50) NOT NULL CHECK (
    pattern_type IN ('keyword', 'phrase', 'intent', 'domain')
  ),

  -- Matching
  trigger_keywords TEXT[] DEFAULT '{}',
  trigger_phrases TEXT[] DEFAULT '{}',
  exclude_keywords TEXT[] DEFAULT '{}',  -- Nicht auslösen wenn diese vorkommen

  -- Recherche-Konfiguration
  search_sources TEXT[] DEFAULT '{"web"}',  -- 'web', 'sap', 'internal', 'api'
  search_depth VARCHAR(20) DEFAULT 'standard',  -- 'quick', 'standard', 'deep'
  max_results INTEGER DEFAULT 5,

  -- Aktivität
  is_active BOOLEAN DEFAULT true,
  trigger_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_domain_focus_context ON domain_focus(context, is_active);
CREATE INDEX IF NOT EXISTS idx_domain_focus_embedding ON domain_focus USING hnsw (focus_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_proactive_research_status ON proactive_research(context, status);
CREATE INDEX IF NOT EXISTS idx_proactive_research_trigger ON proactive_research(trigger_idea_id);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_idea ON ai_response_feedback(idea_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_context ON ai_response_feedback(context, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_profile_context ON business_profile(context, user_id);
CREATE INDEX IF NOT EXISTS idx_business_profile_embedding ON business_profile USING hnsw (profile_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_daily_learning_date ON daily_learning_log(context, learning_date DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_suggestions(context, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_type ON ai_suggestions(suggestion_type, status);

CREATE INDEX IF NOT EXISTS idx_research_patterns_active ON research_patterns(context, is_active);

-- Standard-Recherche-Patterns einfügen
INSERT INTO research_patterns (context, pattern_name, pattern_type, trigger_keywords, trigger_phrases, search_sources)
VALUES
  ('personal', 'Recherche-Aufgabe', 'phrase',
   ARRAY['recherchieren', 'recherche', 'herausfinden', 'untersuchen', 'prüfen'],
   ARRAY['muss ich recherchieren', 'sollte ich recherchieren', 'will ich recherchieren', 'noch recherchieren'],
   ARRAY['web']),
  ('personal', 'Technologie-Frage', 'keyword',
   ARRAY['wie funktioniert', 'was ist', 'unterschied zwischen', 'best practice'],
   ARRAY['wie kann ich', 'was bedeutet'],
   ARRAY['web']),
  ('work', 'SAP-Recherche', 'domain',
   ARRAY['SAP', 'BAPI', 'RFC', 'S/4HANA', 'Fiori'],
   ARRAY['SAP Schnittstelle', 'SAP Integration'],
   ARRAY['web', 'sap']),
  ('work', 'API-Recherche', 'domain',
   ARRAY['API', 'REST', 'Schnittstelle', 'Integration', 'Endpoint'],
   ARRAY['API Dokumentation', 'wie integriere ich'],
   ARRAY['web']),
  ('work', 'Business-Recherche', 'phrase',
   ARRAY['Markt', 'Wettbewerb', 'Trend', 'Strategie'],
   ARRAY['analysieren', 'evaluieren', 'bewerten'],
   ARRAY['web'])
ON CONFLICT DO NOTHING;

-- Kommentar zur Migration
COMMENT ON TABLE domain_focus IS 'Fokus-Themen, auf die sich die KI konzentrieren soll';
COMMENT ON TABLE proactive_research IS 'Automatisch durchgeführte Recherchen zu erkannten Aufgaben';
COMMENT ON TABLE ai_response_feedback IS 'Nutzer-Feedback zu KI-Antworten für kontinuierliches Lernen';
COMMENT ON TABLE business_profile IS 'Verständnis für den Nutzer und sein Business';
COMMENT ON TABLE daily_learning_log IS 'Tägliches Lern-Protokoll der KI';
COMMENT ON TABLE ai_suggestions IS 'Proaktive Vorschläge der KI';
COMMENT ON TABLE research_patterns IS 'Patterns die automatische Recherche auslösen';
