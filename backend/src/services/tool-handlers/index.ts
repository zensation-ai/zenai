/**
 * Tool Handlers
 *
 * Implements the actual functionality for Claude Tool Use.
 * Connects the abstract tool definitions with real operations.
 *
 * Organized into sub-modules:
 * - idea-tools: Idea CRUD and search handlers + calculator
 * - memory-recall-tools: Remember, recall, introspect handlers
 * - assistant-tools: Meeting, navigation, help, calendar, email, travel
 * - github-tools: GitHub integration handlers
 * - project-tools: Project/workspace analysis handlers
 * - web-tools: Web search and URL fetch handlers
 * - code-tools: Sandboxed code execution handler
 * - document-tools: Document search, analysis, and synthesis handlers
 * - business-tools: Business metrics and reporting handlers
 * - maps-tools: Google Maps integration handlers
 * - memory-tools: Memory update/delete/profile handlers
 * - email-tools: Email intelligence handlers
 * - mcp-tools: MCP ecosystem handlers
 * - memory-self-editing: Memory replace/abstract/search-and-link handlers
 * - conversation-search: Conversation search handlers
 *
 * @module services/tool-handlers
 */

import { logger } from '../../utils/logger';
import {
  toolRegistry,
  TOOL_SEARCH_IDEAS,
  TOOL_CREATE_IDEA,
  TOOL_GET_RELATED,
  TOOL_CALCULATE,
  TOOL_REMEMBER,
  TOOL_RECALL,
  TOOL_MEMORY_INTROSPECT,
  TOOL_WEB_SEARCH,
  TOOL_FETCH_URL,
  TOOL_GITHUB_SEARCH,
  TOOL_GITHUB_CREATE_ISSUE,
  TOOL_GITHUB_REPO_INFO,
  TOOL_GITHUB_LIST_ISSUES,
  TOOL_GITHUB_PR_SUMMARY,
  TOOL_ANALYZE_PROJECT,
  TOOL_PROJECT_SUMMARY,
  TOOL_LIST_PROJECT_FILES,
  TOOL_EXECUTE_CODE,
  TOOL_ANALYZE_DOCUMENT,
  TOOL_SEARCH_DOCUMENTS,
  TOOL_SYNTHESIZE_KNOWLEDGE,
  TOOL_CREATE_MEETING,
  TOOL_NAVIGATE_TO,
  TOOL_APP_HELP,
  TOOL_GET_REVENUE_METRICS,
  TOOL_GET_TRAFFIC_ANALYTICS,
  TOOL_GET_SEO_PERFORMANCE,
  TOOL_GET_SYSTEM_HEALTH,
  TOOL_GENERATE_BUSINESS_REPORT,
  TOOL_IDENTIFY_ANOMALIES,
  TOOL_COMPARE_PERIODS,
  TOOL_CREATE_CALENDAR_EVENT,
  TOOL_LIST_CALENDAR_EVENTS,
  TOOL_DRAFT_EMAIL,
  TOOL_ESTIMATE_TRAVEL,
  TOOL_GET_DIRECTIONS,
  TOOL_GET_OPENING_HOURS,
  TOOL_FIND_NEARBY,
  TOOL_OPTIMIZE_ROUTE,
  TOOL_MEMORY_UPDATE,
  TOOL_MEMORY_DELETE,
  TOOL_MEMORY_UPDATE_PROFILE,
  TOOL_MEMORY_RETHINK,
  TOOL_MEMORY_RESTRUCTURE,
  TOOL_ASK_INBOX,
  TOOL_INBOX_SUMMARY,
  TOOL_MCP_CALL_TOOL,
  TOOL_MCP_LIST_TOOLS,
  TOOL_UPDATE_IDEA,
  TOOL_ARCHIVE_IDEA,
  TOOL_DELETE_IDEA,
  TOOL_MEMORY_REPLACE,
  TOOL_MEMORY_ABSTRACT,
  TOOL_MEMORY_SEARCH_AND_LINK,
  TOOL_CORE_MEMORY_READ,
  TOOL_CORE_MEMORY_UPDATE,
  TOOL_CORE_MEMORY_APPEND,
} from '../claude/tool-use';

// Sub-module imports — extracted handlers
import { handleSearchIdeas, handleCreateIdea, handleGetRelated, handleCalculate, handleUpdateIdea, handleArchiveIdea, handleDeleteIdea } from './idea-tools';
import { handleRemember, handleRecall, handleMemoryIntrospect } from './memory-recall-tools';
import { handleCreateMeeting, handleNavigateTo, handleAppHelp, handleCreateCalendarEvent, handleListCalendarEvents, handleDraftEmail, handleEstimateTravel } from './assistant-tools';

// Sub-module imports — pre-existing
import { handleWebSearch, handleFetchUrl } from './web-tools';
import { handleGitHubSearch, handleGitHubCreateIssue, handleGitHubRepoInfo, handleGitHubListIssues, handleGitHubPRSummary } from './github-tools';
import { handleAnalyzeProject, handleProjectSummary, handleListProjectFiles } from './project-tools';
import { handleExecuteCode } from './code-tools';
import { handleSearchDocuments, handleAnalyzeDocument, handleSynthesizeKnowledge } from './document-tools';
import {
  handleGetRevenueMetrics,
  handleGetTrafficAnalytics,
  handleGetSeoPerformance,
  handleGetSystemHealth,
  handleGenerateBusinessReport,
  handleIdentifyAnomalies,
  handleComparePeriods,
} from './business-tools';
import {
  handleGetDirections,
  handleGetOpeningHours,
  handleFindNearbyPlaces,
  handleOptimizeDayRoute,
} from './maps-tools';
import {
  handleMemoryUpdate,
  handleMemoryDelete,
  handleMemoryUpdateProfile,
  handleMemoryRethink,
  handleMemoryRestructure,
} from './memory-tools';
import {
  handleAskInbox,
  handleInboxSummary,
} from './email-tools';
import {
  handleMCPCallTool,
  handleMCPListTools,
} from './mcp-tools';
import {
  handleMemoryReplace,
  handleMemoryAbstract,
  handleMemorySearchAndLink,
} from './memory-self-editing';
import {
  handleConversationSearch,
  handleConversationSearchDate,
  TOOL_CONVERSATION_SEARCH,
  TOOL_CONVERSATION_SEARCH_DATE,
} from './conversation-search';
import {
  handleCoreMemoryRead,
  handleCoreMemoryUpdate,
  handleCoreMemoryAppend,
} from './core-memory-tools';

// ===========================================
// Registration
// ===========================================

/**
 * Register all tool handlers
 * Call this during application startup
 */
export function registerAllToolHandlers(): void {
  logger.info('Registering tool handlers');

  // Core tools (idea-tools.ts)
  toolRegistry.register(TOOL_SEARCH_IDEAS, handleSearchIdeas);
  toolRegistry.register(TOOL_CREATE_IDEA, handleCreateIdea);
  toolRegistry.register(TOOL_GET_RELATED, handleGetRelated);
  toolRegistry.register(TOOL_CALCULATE, handleCalculate);

  // Memory tools — HiMeS integration (memory-recall-tools.ts)
  toolRegistry.register(TOOL_REMEMBER, handleRemember);
  toolRegistry.register(TOOL_RECALL, handleRecall);
  toolRegistry.register(TOOL_MEMORY_INTROSPECT, handleMemoryIntrospect);

  // Web tools (web-tools.ts)
  toolRegistry.register(TOOL_WEB_SEARCH, handleWebSearch);
  toolRegistry.register(TOOL_FETCH_URL, handleFetchUrl);

  // GitHub tools (github-tools.ts)
  toolRegistry.register(TOOL_GITHUB_SEARCH, handleGitHubSearch);
  toolRegistry.register(TOOL_GITHUB_CREATE_ISSUE, handleGitHubCreateIssue);
  toolRegistry.register(TOOL_GITHUB_REPO_INFO, handleGitHubRepoInfo);
  toolRegistry.register(TOOL_GITHUB_LIST_ISSUES, handleGitHubListIssues);
  toolRegistry.register(TOOL_GITHUB_PR_SUMMARY, handleGitHubPRSummary);

  // Project context tools (project-tools.ts)
  toolRegistry.register(TOOL_ANALYZE_PROJECT, handleAnalyzeProject);
  toolRegistry.register(TOOL_PROJECT_SUMMARY, handleProjectSummary);
  toolRegistry.register(TOOL_LIST_PROJECT_FILES, handleListProjectFiles);

  // Code execution tools (code-tools.ts)
  toolRegistry.register(TOOL_EXECUTE_CODE, handleExecuteCode);

  // Document tools (document-tools.ts)
  toolRegistry.register(TOOL_ANALYZE_DOCUMENT, handleAnalyzeDocument);
  toolRegistry.register(TOOL_SEARCH_DOCUMENTS, handleSearchDocuments);
  toolRegistry.register(TOOL_SYNTHESIZE_KNOWLEDGE, handleSynthesizeKnowledge);

  // Assistant tools (assistant-tools.ts)
  toolRegistry.register(TOOL_CREATE_MEETING, handleCreateMeeting);
  toolRegistry.register(TOOL_NAVIGATE_TO, handleNavigateTo);
  toolRegistry.register(TOOL_APP_HELP, handleAppHelp);

  // Business Manager tools (business-tools.ts)
  toolRegistry.register(TOOL_GET_REVENUE_METRICS, handleGetRevenueMetrics);
  toolRegistry.register(TOOL_GET_TRAFFIC_ANALYTICS, handleGetTrafficAnalytics);
  toolRegistry.register(TOOL_GET_SEO_PERFORMANCE, handleGetSeoPerformance);
  toolRegistry.register(TOOL_GET_SYSTEM_HEALTH, handleGetSystemHealth);
  toolRegistry.register(TOOL_GENERATE_BUSINESS_REPORT, handleGenerateBusinessReport);
  toolRegistry.register(TOOL_IDENTIFY_ANOMALIES, handleIdentifyAnomalies);
  toolRegistry.register(TOOL_COMPARE_PERIODS, handleComparePeriods);

  // Calendar, Email, Travel tools (assistant-tools.ts)
  toolRegistry.register(TOOL_CREATE_CALENDAR_EVENT, handleCreateCalendarEvent);
  toolRegistry.register(TOOL_LIST_CALENDAR_EVENTS, handleListCalendarEvents);
  toolRegistry.register(TOOL_DRAFT_EMAIL, handleDraftEmail);
  toolRegistry.register(TOOL_ESTIMATE_TRAVEL, handleEstimateTravel);

  // Maps tools (maps-tools.ts)
  toolRegistry.register(TOOL_GET_DIRECTIONS, handleGetDirections);
  toolRegistry.register(TOOL_GET_OPENING_HOURS, handleGetOpeningHours);
  toolRegistry.register(TOOL_FIND_NEARBY, handleFindNearbyPlaces);
  toolRegistry.register(TOOL_OPTIMIZE_ROUTE, handleOptimizeDayRoute);

  // Memory management tools (memory-tools.ts)
  toolRegistry.register(TOOL_MEMORY_UPDATE, handleMemoryUpdate);
  toolRegistry.register(TOOL_MEMORY_DELETE, handleMemoryDelete);
  toolRegistry.register(TOOL_MEMORY_UPDATE_PROFILE, handleMemoryUpdateProfile);
  toolRegistry.register(TOOL_MEMORY_RETHINK, handleMemoryRethink);
  toolRegistry.register(TOOL_MEMORY_RESTRUCTURE, handleMemoryRestructure);

  // Email Intelligence tools (email-tools.ts)
  toolRegistry.register(TOOL_ASK_INBOX, handleAskInbox);
  toolRegistry.register(TOOL_INBOX_SUMMARY, handleInboxSummary);

  // MCP Ecosystem tools (mcp-tools.ts)
  toolRegistry.register(TOOL_MCP_CALL_TOOL, handleMCPCallTool);
  toolRegistry.register(TOOL_MCP_LIST_TOOLS, handleMCPListTools);

  // Memory Self-Editing tools (memory-self-editing.ts)
  toolRegistry.register(TOOL_MEMORY_REPLACE, handleMemoryReplace);
  toolRegistry.register(TOOL_MEMORY_ABSTRACT, handleMemoryAbstract);
  toolRegistry.register(TOOL_MEMORY_SEARCH_AND_LINK, handleMemorySearchAndLink);

  // CRUD tools — idea management (idea-tools.ts)
  toolRegistry.register(TOOL_UPDATE_IDEA, handleUpdateIdea);
  toolRegistry.register(TOOL_ARCHIVE_IDEA, handleArchiveIdea);
  toolRegistry.register(TOOL_DELETE_IDEA, handleDeleteIdea);

  // Conversation search tools (conversation-search.ts)
  toolRegistry.register(TOOL_CONVERSATION_SEARCH, handleConversationSearch);
  toolRegistry.register(TOOL_CONVERSATION_SEARCH_DATE, handleConversationSearchDate);

  // Core Memory tools (core-memory-tools.ts) — Phase 126
  toolRegistry.register(TOOL_CORE_MEMORY_READ, handleCoreMemoryRead);
  toolRegistry.register(TOOL_CORE_MEMORY_UPDATE, handleCoreMemoryUpdate);
  toolRegistry.register(TOOL_CORE_MEMORY_APPEND, handleCoreMemoryAppend);

  logger.info('Tool handlers registered', {
    tools: [
      'search_ideas', 'create_idea', 'get_related_ideas', 'calculate',
      'remember', 'recall', 'memory_introspect',
      'web_search', 'fetch_url',
      'github_search', 'github_create_issue', 'github_repo_info', 'github_list_issues', 'github_pr_summary',
      'analyze_project', 'get_project_summary', 'list_project_files',
      'execute_code',
      'analyze_document', 'search_documents', 'synthesize_knowledge',
      'create_meeting', 'navigate_to', 'app_help',
      'get_revenue_metrics', 'get_traffic_analytics', 'get_seo_performance',
      'get_system_health', 'generate_business_report', 'identify_anomalies', 'compare_periods',
      'create_calendar_event', 'list_calendar_events', 'draft_email', 'estimate_travel',
      'get_directions', 'get_opening_hours', 'find_nearby_places', 'optimize_day_route',
      'memory_update', 'memory_delete', 'memory_update_profile',
      'memory_rethink', 'memory_restructure',
      'ask_inbox', 'inbox_summary',
      'mcp_call_tool', 'mcp_list_tools',
      'memory_replace', 'memory_abstract', 'memory_search_and_link',
      'update_idea', 'archive_idea', 'delete_idea',
      'conversation_search', 'conversation_search_date',
      'core_memory_read', 'core_memory_update', 'core_memory_append',
    ],
  });
}

/**
 * Check if handlers are registered
 */
export function areToolsRegistered(): boolean {
  return toolRegistry.has('search_ideas') &&
         toolRegistry.has('web_search') &&
         toolRegistry.has('fetch_url') &&
         toolRegistry.has('analyze_project') &&
         toolRegistry.has('analyze_document');
}
