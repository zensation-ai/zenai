-- ===========================================
-- Add get_idea_recommendations Function
-- ===========================================
-- Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/hgqqciztvdvzehgcoyrw/sql/new

CREATE OR REPLACE FUNCTION get_idea_recommendations(
  user_context VARCHAR(50) DEFAULT 'personal',
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title VARCHAR(255),
  summary TEXT,
  type VARCHAR(50),
  category VARCHAR(50),
  priority VARCHAR(20),
  relevance_score FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  user_interest_embedding vector(768);
BEGIN
  -- Get user's interest embedding from profile
  SELECT interest_embedding INTO user_interest_embedding
  FROM user_profile
  WHERE user_profile.id = 'default'
  LIMIT 1;

  -- If no user embedding, return recent ideas
  IF user_interest_embedding IS NULL THEN
    RETURN QUERY
    SELECT
      i.id,
      i.title,
      i.summary,
      i.type,
      i.category,
      i.priority,
      0.0::FLOAT as relevance_score,
      i.created_at
    FROM ideas i
    WHERE i.context = user_context
      AND i.is_archived = FALSE
    ORDER BY i.created_at DESC
    LIMIT match_count;
  ELSE
    -- Return ideas similar to user interests
    RETURN QUERY
    SELECT
      i.id,
      i.title,
      i.summary,
      i.type,
      i.category,
      i.priority,
      1 - (i.embedding <=> user_interest_embedding) as relevance_score,
      i.created_at
    FROM ideas i
    WHERE i.context = user_context
      AND i.embedding IS NOT NULL
      AND i.is_archived = FALSE
    ORDER BY i.embedding <=> user_interest_embedding
    LIMIT match_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT 'Function created successfully! Testing...' as status;
SELECT * FROM get_idea_recommendations('personal', 5);
