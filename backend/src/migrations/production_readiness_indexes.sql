-- Production Readiness: Missing Database Indexes
-- Date: 2026-01-28
-- Purpose: Add indexes for commonly queried columns to improve query performance

-- =====================================================
-- Ideas Table Indexes
-- =====================================================

-- Index for filtering archived items (very common filter)
CREATE INDEX IF NOT EXISTS idx_ideas_is_archived
ON ideas(is_archived)
WHERE is_archived = false;

-- Index for status filtering (used in triage, lists)
CREATE INDEX IF NOT EXISTS idx_ideas_status
ON ideas(status);

-- Index for context filtering (personal/work separation)
CREATE INDEX IF NOT EXISTS idx_ideas_context
ON ideas(context);

-- Index for priority filtering (high priority items)
CREATE INDEX IF NOT EXISTS idx_ideas_priority
ON ideas(priority);

-- Composite index for common query pattern: context + is_archived + created_at
CREATE INDEX IF NOT EXISTS idx_ideas_context_archived_created
ON ideas(context, is_archived, created_at DESC);

-- Index for type filtering
CREATE INDEX IF NOT EXISTS idx_ideas_type
ON ideas(type);

-- =====================================================
-- Automation Tables Indexes
-- =====================================================

-- Index for active automation definitions
CREATE INDEX IF NOT EXISTS idx_automation_definitions_is_active
ON automation_definitions(is_active)
WHERE is_active = true;

-- Index for automation executions by automation_id
CREATE INDEX IF NOT EXISTS idx_automation_executions_automation_id
ON automation_executions(automation_id);

-- Index for automation executions by timestamp (for recent executions query)
CREATE INDEX IF NOT EXISTS idx_automation_executions_executed_at
ON automation_executions(executed_at DESC);

-- =====================================================
-- Media Items Indexes
-- =====================================================

-- Index for media items by context
CREATE INDEX IF NOT EXISTS idx_media_items_context
ON media_items(context);

-- =====================================================
-- API Keys Indexes
-- =====================================================

-- Index for active API keys lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active
ON api_keys(is_active)
WHERE is_active = true;

-- =====================================================
-- Sessions/Memory Tables Indexes
-- =====================================================

-- Index for chat sessions by context and created_at
CREATE INDEX IF NOT EXISTS idx_chat_sessions_context_created
ON chat_sessions(context, created_at DESC);

-- Index for memory items by context and timestamp
CREATE INDEX IF NOT EXISTS idx_memory_items_context_timestamp
ON memory_items(context, timestamp DESC);

-- =====================================================
-- Log and Tracking Tables Indexes
-- =====================================================

-- Index for audit logs by timestamp (most recent first)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
ON audit_logs(timestamp DESC);

-- Index for interaction tracking by context and created_at
CREATE INDEX IF NOT EXISTS idx_interactions_context_created
ON user_interactions(context, created_at DESC);

-- =====================================================
-- Performance Notes
-- =====================================================
--
-- These indexes are designed to support common query patterns:
-- 1. Filtering by is_archived (almost always filtering for non-archived)
-- 2. Filtering by context (personal/work separation)
-- 3. Sorting by created_at DESC (most recent first)
-- 4. Filtering active items only (is_active = true)
--
-- Partial indexes (WHERE clause) are used to reduce index size
-- and improve performance for the most common cases.
--
-- Run with: psql $DATABASE_URL -f production_readiness_indexes.sql
