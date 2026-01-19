-- Phase 30: Security & Performance Indexes
-- Critical indexes for multi-tenant security and query performance
-- Run on both personal_ai and work_ai databases
--
-- Created: 2026-01-19
-- Purpose: Address missing indexes identified in code quality review

-- ===========================================
-- CRITICAL: Multi-Tenant Security Indexes
-- These indexes are essential for proper data isolation
-- ===========================================

-- Ideas table: user_id filtering (CRITICAL for security)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_user_id
ON ideas (user_id);

-- Ideas table: composite index for multi-tenant queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_user_context
ON ideas (user_id, context);

-- Ideas table: composite for filtered listing with user isolation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ideas_user_archived_created
ON ideas (user_id, is_archived, created_at DESC);

-- Voice memos: user isolation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_voice_memos_user_id
ON voice_memos (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_voice_memos_user_context
ON voice_memos (user_id, context);

-- Media items: user isolation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_items_user_id
ON media_items (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_items_user_context
ON media_items (user_id, context);

-- Meetings: user isolation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meetings_user_id
ON meetings (user_id);

-- ===========================================
-- Performance: Frequently Filtered Columns
-- ===========================================

-- Loose thoughts: status + processed for incubator queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loose_thoughts_status_processed
ON loose_thoughts (status, is_processed)
WHERE is_processed = false;

-- Personalization facts: common lookup pattern
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personalization_facts_user_category
ON personalization_facts (user_id, category);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personalization_facts_user_key
ON personalization_facts (user_id, fact_key);

-- Learning tasks: user + status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learning_tasks_user_status
ON daily_learning_tasks (user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learning_tasks_user_date
ON daily_learning_tasks (user_id, task_date DESC);

-- Digests: user + date filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_digests_user_date
ON digests (user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_digests_user_type
ON digests (user_id, digest_type);

-- Notifications: user + read status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read
ON push_notifications (user_id, is_read);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_created
ON push_notifications (user_id, created_at DESC);

-- ===========================================
-- Knowledge Graph: Relationship Queries
-- ===========================================

-- Idea relations: context filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idea_relations_context
ON idea_relations (context);

-- Knowledge connections: strength-based filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_connections_strength
ON knowledge_connections (strength DESC)
WHERE strength >= 0.5;

-- ===========================================
-- General Chat: Session Queries
-- ===========================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_user_updated
ON general_chat_sessions (user_id, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_session
ON general_chat_messages (session_id, created_at ASC);

-- ===========================================
-- Drafts: User + Status Queries
-- ===========================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idea_drafts_user_status
ON idea_drafts (user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idea_drafts_idea_status
ON idea_drafts (idea_id, status);

-- ===========================================
-- Update Statistics for Query Planner
-- ===========================================

ANALYZE ideas;
ANALYZE voice_memos;
ANALYZE media_items;
ANALYZE meetings;
ANALYZE loose_thoughts;
ANALYZE personalization_facts;
ANALYZE daily_learning_tasks;
ANALYZE digests;
ANALYZE push_notifications;
ANALYZE idea_relations;
ANALYZE general_chat_sessions;
ANALYZE general_chat_messages;
ANALYZE idea_drafts;

-- ===========================================
-- Verify Index Creation
-- ===========================================

-- Query to verify all new indexes exist:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('ideas', 'voice_memos', 'media_items', 'meetings')
-- AND indexname LIKE 'idx_%user%';
