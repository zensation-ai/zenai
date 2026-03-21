-- =====================================================
-- MIGRATION: Demo Schema for Interactive Demo Mode
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-21
-- =====================================================
--
-- Creates a 5th "demo" schema that mirrors the personal schema.
-- Used for the interactive demo feature so demo users do not
-- share or pollute production context schemas.
--
-- Approach: LIKE personal.{table} INCLUDING ALL copies all
-- columns, constraints, defaults, check constraints, and
-- indexes from the personal schema.
--
-- This migration is fully idempotent (CREATE ... IF NOT EXISTS).
-- Run this in Supabase SQL Editor.
-- =====================================================

-- Create the demo schema
CREATE SCHEMA IF NOT EXISTS demo;

-- Ensure required extensions (may already exist)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Copy all tables from personal schema into demo schema
-- using LIKE ... INCLUDING ALL for full structural parity.
-- =====================================================

-- Core idea management
CREATE TABLE IF NOT EXISTS demo.ideas                        (LIKE personal.ideas                        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.idea_relations               (LIKE personal.idea_relations               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.idea_relationships           (LIKE personal.idea_relationships           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.idea_topics                  (LIKE personal.idea_topics                  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.idea_topic_memberships       (LIKE personal.idea_topic_memberships       INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.idea_corrections             (LIKE personal.idea_corrections             INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.idea_drafts                  (LIKE personal.idea_drafts                  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.draft_trigger_patterns       (LIKE personal.draft_trigger_patterns       INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.draft_feedback_history       (LIKE personal.draft_feedback_history       INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.draft_learning_suggestions   (LIKE personal.draft_learning_suggestions   INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.draft_suggestions            (LIKE personal.draft_suggestions            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.triage_history               (LIKE personal.triage_history               INCLUDING ALL);

-- Memory layers
CREATE TABLE IF NOT EXISTS demo.learned_facts                (LIKE personal.learned_facts                INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.episodic_memories            (LIKE personal.episodic_memories            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.working_memory_sessions      (LIKE personal.working_memory_sessions      INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.procedural_memories          (LIKE personal.procedural_memories          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.procedural_memory            (LIKE personal.procedural_memory            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.prospective_memories         (LIKE personal.prospective_memories         INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.memory_audit_trail           (LIKE personal.memory_audit_trail           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.memory_entity_links          (LIKE personal.memory_entity_links          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.memory_privacy_settings      (LIKE personal.memory_privacy_settings      INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.fact_versions                (LIKE personal.fact_versions                INCLUDING ALL);

-- Knowledge graph
CREATE TABLE IF NOT EXISTS demo.knowledge_entities           (LIKE personal.knowledge_entities           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.entity_relations             (LIKE personal.entity_relations             INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.knowledge_connections        (LIKE personal.knowledge_connections        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.graph_communities            (LIKE personal.graph_communities            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.graph_reasoning_cache        (LIKE personal.graph_reasoning_cache        INCLUDING ALL);

-- Chat and conversation
CREATE TABLE IF NOT EXISTS demo.general_chat_sessions        (LIKE personal.general_chat_sessions        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.general_chat_messages        (LIKE personal.general_chat_messages        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.chat_messages                (LIKE personal.chat_messages                INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.conversation_memory          (LIKE personal.conversation_memory          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.conversation_patterns        (LIKE personal.conversation_patterns        INCLUDING ALL);

-- Personalization
CREATE TABLE IF NOT EXISTS demo.personalization_sessions     (LIKE personal.personalization_sessions     INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.personalization_conversations(LIKE personal.personalization_conversations INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.personalization_facts        (LIKE personal.personalization_facts        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.personalization_topics       (LIKE personal.personalization_topics       INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.personal_facts               (LIKE personal.personal_facts               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.user_profile                 (LIKE personal.user_profile                 INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.user_training                (LIKE personal.user_training                INCLUDING ALL);

-- Tasks, projects, and planning
CREATE TABLE IF NOT EXISTS demo.tasks                        (LIKE personal.tasks                        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.task_dependencies            (LIKE personal.task_dependencies            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.projects                     (LIKE personal.projects                     INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.calendar_events              (LIKE personal.calendar_events              INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.calendar_accounts            (LIKE personal.calendar_accounts            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.calendar_reminders           (LIKE personal.calendar_reminders           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.calendar_ai_insights         (LIKE personal.calendar_ai_insights         INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.meetings                     (LIKE personal.meetings                     INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.meeting_notes                (LIKE personal.meeting_notes                INCLUDING ALL);

-- Email and communication
CREATE TABLE IF NOT EXISTS demo.emails                       (LIKE personal.emails                       INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.email_accounts               (LIKE personal.email_accounts               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.email_labels                 (LIKE personal.email_labels                 INCLUDING ALL);

-- Contacts and CRM
CREATE TABLE IF NOT EXISTS demo.contacts                     (LIKE personal.contacts                     INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.organizations                (LIKE personal.organizations                INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.contact_interactions         (LIKE personal.contact_interactions         INCLUDING ALL);

-- Finance
CREATE TABLE IF NOT EXISTS demo.financial_accounts           (LIKE personal.financial_accounts           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.transactions                 (LIKE personal.transactions                 INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.budgets                      (LIKE personal.budgets                      INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.financial_goals              (LIKE personal.financial_goals              INCLUDING ALL);

-- Documents and media
CREATE TABLE IF NOT EXISTS demo.media_items                  (LIKE personal.media_items                  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.screen_captures              (LIKE personal.screen_captures              INCLUDING ALL);

-- Browser and web
CREATE TABLE IF NOT EXISTS demo.browsing_history             (LIKE personal.browsing_history             INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.bookmarks                    (LIKE personal.bookmarks                    INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.geocoding_cache              (LIKE personal.geocoding_cache              INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.places_cache                 (LIKE personal.places_cache                 INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.saved_locations              (LIKE personal.saved_locations              INCLUDING ALL);

-- Learning
CREATE TABLE IF NOT EXISTS demo.learning_tasks               (LIKE personal.learning_tasks               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.learning_sessions            (LIKE personal.learning_sessions            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.learning_insights            (LIKE personal.learning_insights            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.study_sessions               (LIKE personal.study_sessions               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.daily_learning_tasks         (LIKE personal.daily_learning_tasks         INCLUDING ALL);

-- Analytics and insights
CREATE TABLE IF NOT EXISTS demo.analytics_events             (LIKE personal.analytics_events             INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.rag_feedback                 (LIKE personal.rag_feedback                 INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.rag_query_analytics          (LIKE personal.rag_query_analytics          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.thinking_chains              (LIKE personal.thinking_chains              INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.thinking_budget_strategies   (LIKE personal.thinking_budget_strategies   INCLUDING ALL);

-- Notifications and activity
CREATE TABLE IF NOT EXISTS demo.notifications                (LIKE personal.notifications                INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.notification_history         (LIKE personal.notification_history         INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.notification_preferences     (LIKE personal.notification_preferences     INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.ai_activity_log              (LIKE personal.ai_activity_log              INCLUDING ALL);

-- Proactive intelligence
CREATE TABLE IF NOT EXISTS demo.smart_suggestions            (LIKE personal.smart_suggestions            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.proactive_suggestions        (LIKE personal.proactive_suggestions        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.proactive_suggestion_feedback(LIKE personal.proactive_suggestion_feedback INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.proactive_rules              (LIKE personal.proactive_rules              INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.proactive_settings           (LIKE personal.proactive_settings           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.proactive_briefings          (LIKE personal.proactive_briefings          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.proactive_digests            (LIKE personal.proactive_digests            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.system_events                (LIKE personal.system_events                INCLUDING ALL);

-- Agent system
CREATE TABLE IF NOT EXISTS demo.agent_executions             (LIKE personal.agent_executions             INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.agent_checkpoints            (LIKE personal.agent_checkpoints            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.agent_action_log             (LIKE personal.agent_action_log             INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.agent_definitions            (LIKE personal.agent_definitions            INCLUDING ALL);

-- Governance and context
CREATE TABLE IF NOT EXISTS demo.governance_actions           (LIKE personal.governance_actions           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.governance_policies          (LIKE personal.governance_policies          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.audit_log                    (LIKE personal.audit_log                    INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.context_rules                (LIKE personal.context_rules                INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.context_rule_performance     (LIKE personal.context_rule_performance     INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.context_cache                (LIKE personal.context_cache                INCLUDING ALL);

-- MCP connections
CREATE TABLE IF NOT EXISTS demo.mcp_server_connections       (LIKE personal.mcp_server_connections       INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.mcp_external_tools           (LIKE personal.mcp_external_tools           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.mcp_connections              (LIKE personal.mcp_connections              INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.mcp_tool_call_log            (LIKE personal.mcp_tool_call_log            INCLUDING ALL);

-- Voice
CREATE TABLE IF NOT EXISTS demo.voice_memos                  (LIKE personal.voice_memos                  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.voice_sessions               (LIKE personal.voice_sessions               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.voice_settings               (LIKE personal.voice_settings               INCLUDING ALL);

-- Productivity and habits
CREATE TABLE IF NOT EXISTS demo.productivity_goals           (LIKE personal.productivity_goals           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.user_goals                   (LIKE personal.user_goals                   INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.focus_sessions               (LIKE personal.focus_sessions               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.habit_patterns               (LIKE personal.habit_patterns               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.habit_activities             (LIKE personal.habit_activities             INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.routine_patterns             (LIKE personal.routine_patterns             INCLUDING ALL);

-- Workspace and automation
CREATE TABLE IF NOT EXISTS demo.workspace_automations        (LIKE personal.workspace_automations        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.automation_executions        (LIKE personal.automation_executions        INCLUDING ALL);

-- Miscellaneous
CREATE TABLE IF NOT EXISTS demo.loose_thoughts               (LIKE personal.loose_thoughts               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.thought_clusters             (LIKE personal.thought_clusters             INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.pattern_predictions          (LIKE personal.pattern_predictions          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.interaction_history          (LIKE personal.interaction_history          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.push_tokens                  (LIKE personal.push_tokens                  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.rate_limits                  (LIKE personal.rate_limits                  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.export_history               (LIKE personal.export_history               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.digests                      (LIKE personal.digests                      INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.user_feedback                (LIKE personal.user_feedback                INCLUDING ALL);

-- Digital twin
CREATE TABLE IF NOT EXISTS demo.digital_twin_profiles        (LIKE personal.digital_twin_profiles        INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.digital_twin_corrections     (LIKE personal.digital_twin_corrections     INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.digital_twin_snapshots       (LIKE personal.digital_twin_snapshots       INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.evolution_snapshots          (LIKE personal.evolution_snapshots          INCLUDING ALL);

-- Business
CREATE TABLE IF NOT EXISTS demo.custom_kpis                  (LIKE personal.custom_kpis                  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.business_narratives          (LIKE personal.business_narratives          INCLUDING ALL);

-- Search and reflection
CREATE TABLE IF NOT EXISTS demo.search_history               (LIKE personal.search_history               INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.reflection_insights          (LIKE personal.reflection_insights          INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.workflow_patterns            (LIKE personal.workflow_patterns            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.assistant_interactions       (LIKE personal.assistant_interactions       INCLUDING ALL);

-- Sleep compute
CREATE TABLE IF NOT EXISTS demo.sleep_compute_logs           (LIKE personal.sleep_compute_logs           INCLUDING ALL);

-- Security and rate limiting (per-context copies)
CREATE TABLE IF NOT EXISTS demo.security_audit_log           (LIKE personal.security_audit_log           INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.rate_limit_config            (LIKE personal.rate_limit_config            INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.user_roles                   (LIKE personal.user_roles                   INCLUDING ALL);

-- Queue (per-context copies)
CREATE TABLE IF NOT EXISTS demo.job_history                  (LIKE personal.job_history                  INCLUDING ALL);
CREATE TABLE IF NOT EXISTS demo.metric_snapshots             (LIKE personal.metric_snapshots             INCLUDING ALL);

-- Domain focus and A2A
CREATE TABLE IF NOT EXISTS demo.domain_focus                 (LIKE personal.domain_focus                 INCLUDING ALL);

-- =====================================================
-- Insert default seed rows for single-row tables
-- =====================================================

-- productivity_goals uses a single-row pattern (id = 1)
INSERT INTO demo.productivity_goals (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Verification
-- =====================================================

DO $$
DECLARE
  demo_count INTEGER;
  personal_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO demo_count
  FROM pg_tables
  WHERE schemaname = 'demo';

  SELECT COUNT(*) INTO personal_count
  FROM pg_tables
  WHERE schemaname = 'personal';

  RAISE NOTICE 'Demo schema migration complete.';
  RAISE NOTICE '  demo schema tables: %', demo_count;
  RAISE NOTICE '  personal schema tables: %', personal_count;
END $$;
