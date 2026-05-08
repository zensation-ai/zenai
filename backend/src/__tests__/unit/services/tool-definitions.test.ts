/**
 * Unit Tests for Claude Tool Definitions
 *
 * Validates structural integrity, uniqueness, schema correctness,
 * and category groupings for all 55+ tool definitions.
 *
 * @module tests/unit/services/tool-definitions
 */

import {
  TOOL_SEARCH_IDEAS, TOOL_CREATE_IDEA, TOOL_GET_RELATED,
  TOOL_WEB_SEARCH, TOOL_FETCH_URL,
  TOOL_GITHUB_SEARCH, TOOL_GITHUB_CREATE_ISSUE, TOOL_GITHUB_REPO_INFO, TOOL_GITHUB_LIST_ISSUES, TOOL_GITHUB_PR_SUMMARY,
  TOOL_CALCULATE, TOOL_REMEMBER, TOOL_RECALL, TOOL_MEMORY_INTROSPECT,
  TOOL_ANALYZE_PROJECT, TOOL_PROJECT_SUMMARY, TOOL_LIST_PROJECT_FILES,
  TOOL_EXECUTE_CODE, TOOL_ANALYZE_DOCUMENT, TOOL_SEARCH_DOCUMENTS, TOOL_SYNTHESIZE_KNOWLEDGE,
  TOOL_CREATE_MEETING, TOOL_NAVIGATE_TO, TOOL_APP_HELP,
  TOOL_UPDATE_IDEA, TOOL_ARCHIVE_IDEA, TOOL_DELETE_IDEA,
  TOOL_GET_REVENUE_METRICS, TOOL_GET_TRAFFIC_ANALYTICS, TOOL_GET_SEO_PERFORMANCE,
  TOOL_GET_SYSTEM_HEALTH, TOOL_GENERATE_BUSINESS_REPORT, TOOL_IDENTIFY_ANOMALIES, TOOL_COMPARE_PERIODS,
  TOOL_CREATE_CALENDAR_EVENT, TOOL_LIST_CALENDAR_EVENTS, TOOL_DRAFT_EMAIL, TOOL_ESTIMATE_TRAVEL,
  TOOL_MEMORY_UPDATE, TOOL_MEMORY_DELETE, TOOL_MEMORY_UPDATE_PROFILE,
  TOOL_GET_DIRECTIONS, TOOL_GET_OPENING_HOURS, TOOL_FIND_NEARBY, TOOL_OPTIMIZE_ROUTE,
  TOOL_ASK_INBOX, TOOL_INBOX_SUMMARY,
  TOOL_MCP_CALL_TOOL, TOOL_MCP_LIST_TOOLS,
  TOOL_MEMORY_RETHINK, TOOL_MEMORY_RESTRUCTURE,
  TOOL_MEMORY_REPLACE, TOOL_MEMORY_ABSTRACT, TOOL_MEMORY_SEARCH_AND_LINK,
  TOOL_CORE_MEMORY_READ, TOOL_CORE_MEMORY_UPDATE, TOOL_CORE_MEMORY_APPEND,
  TOOL_OPEN_PANEL,
} from '../../../services/claude/tool-definitions';

import type { ToolDefinition } from '../../../services/claude/tool-use';

// ===========================================
// Collect all tools for bulk validation
// ===========================================

const ALL_TOOLS: ToolDefinition[] = [
  TOOL_SEARCH_IDEAS, TOOL_CREATE_IDEA, TOOL_GET_RELATED,
  TOOL_WEB_SEARCH, TOOL_FETCH_URL,
  TOOL_GITHUB_SEARCH, TOOL_GITHUB_CREATE_ISSUE, TOOL_GITHUB_REPO_INFO, TOOL_GITHUB_LIST_ISSUES, TOOL_GITHUB_PR_SUMMARY,
  TOOL_CALCULATE, TOOL_REMEMBER, TOOL_RECALL, TOOL_MEMORY_INTROSPECT,
  TOOL_ANALYZE_PROJECT, TOOL_PROJECT_SUMMARY, TOOL_LIST_PROJECT_FILES,
  TOOL_EXECUTE_CODE, TOOL_ANALYZE_DOCUMENT, TOOL_SEARCH_DOCUMENTS, TOOL_SYNTHESIZE_KNOWLEDGE,
  TOOL_CREATE_MEETING, TOOL_NAVIGATE_TO, TOOL_APP_HELP,
  TOOL_UPDATE_IDEA, TOOL_ARCHIVE_IDEA, TOOL_DELETE_IDEA,
  TOOL_GET_REVENUE_METRICS, TOOL_GET_TRAFFIC_ANALYTICS, TOOL_GET_SEO_PERFORMANCE,
  TOOL_GET_SYSTEM_HEALTH, TOOL_GENERATE_BUSINESS_REPORT, TOOL_IDENTIFY_ANOMALIES, TOOL_COMPARE_PERIODS,
  TOOL_CREATE_CALENDAR_EVENT, TOOL_LIST_CALENDAR_EVENTS, TOOL_DRAFT_EMAIL, TOOL_ESTIMATE_TRAVEL,
  TOOL_MEMORY_UPDATE, TOOL_MEMORY_DELETE, TOOL_MEMORY_UPDATE_PROFILE,
  TOOL_GET_DIRECTIONS, TOOL_GET_OPENING_HOURS, TOOL_FIND_NEARBY, TOOL_OPTIMIZE_ROUTE,
  TOOL_ASK_INBOX, TOOL_INBOX_SUMMARY,
  TOOL_MCP_CALL_TOOL, TOOL_MCP_LIST_TOOLS,
  TOOL_MEMORY_RETHINK, TOOL_MEMORY_RESTRUCTURE,
  TOOL_MEMORY_REPLACE, TOOL_MEMORY_ABSTRACT, TOOL_MEMORY_SEARCH_AND_LINK,
  TOOL_CORE_MEMORY_READ, TOOL_CORE_MEMORY_UPDATE, TOOL_CORE_MEMORY_APPEND,
  TOOL_OPEN_PANEL,
];

// Category groupings for validation
const CATEGORIES = {
  'Core Ideas': [TOOL_SEARCH_IDEAS, TOOL_CREATE_IDEA, TOOL_GET_RELATED, TOOL_UPDATE_IDEA, TOOL_ARCHIVE_IDEA, TOOL_DELETE_IDEA],
  'Web': [TOOL_WEB_SEARCH, TOOL_FETCH_URL],
  'GitHub': [TOOL_GITHUB_SEARCH, TOOL_GITHUB_CREATE_ISSUE, TOOL_GITHUB_REPO_INFO, TOOL_GITHUB_LIST_ISSUES, TOOL_GITHUB_PR_SUMMARY],
  'Memory': [TOOL_REMEMBER, TOOL_RECALL, TOOL_MEMORY_INTROSPECT, TOOL_MEMORY_UPDATE, TOOL_MEMORY_DELETE, TOOL_MEMORY_UPDATE_PROFILE, TOOL_MEMORY_RETHINK, TOOL_MEMORY_RESTRUCTURE, TOOL_MEMORY_REPLACE, TOOL_MEMORY_ABSTRACT, TOOL_MEMORY_SEARCH_AND_LINK],
  'Core Memory': [TOOL_CORE_MEMORY_READ, TOOL_CORE_MEMORY_UPDATE, TOOL_CORE_MEMORY_APPEND],
  'Project Context': [TOOL_ANALYZE_PROJECT, TOOL_PROJECT_SUMMARY, TOOL_LIST_PROJECT_FILES],
  'Code Execution': [TOOL_EXECUTE_CODE],
  'Documents': [TOOL_ANALYZE_DOCUMENT, TOOL_SEARCH_DOCUMENTS, TOOL_SYNTHESIZE_KNOWLEDGE],
  'Assistant': [TOOL_CREATE_MEETING, TOOL_NAVIGATE_TO, TOOL_APP_HELP, TOOL_CALCULATE],
  'Business': [TOOL_GET_REVENUE_METRICS, TOOL_GET_TRAFFIC_ANALYTICS, TOOL_GET_SEO_PERFORMANCE, TOOL_GET_SYSTEM_HEALTH, TOOL_GENERATE_BUSINESS_REPORT, TOOL_IDENTIFY_ANOMALIES, TOOL_COMPARE_PERIODS],
  'Calendar/Email': [TOOL_CREATE_CALENDAR_EVENT, TOOL_LIST_CALENDAR_EVENTS, TOOL_DRAFT_EMAIL, TOOL_ESTIMATE_TRAVEL],
  'Maps': [TOOL_GET_DIRECTIONS, TOOL_GET_OPENING_HOURS, TOOL_FIND_NEARBY, TOOL_OPTIMIZE_ROUTE],
  'Email Intelligence': [TOOL_ASK_INBOX, TOOL_INBOX_SUMMARY],
  'MCP': [TOOL_MCP_CALL_TOOL, TOOL_MCP_LIST_TOOLS],
  'UI': [TOOL_OPEN_PANEL],
};

const VALID_SCHEMA_TYPES = ['string', 'number', 'boolean', 'array', 'object'];

describe('Tool Definitions', () => {
  // ===========================================
  // Structural Validity (all tools)
  // ===========================================

  describe('Structural Validity', () => {
    it.each(ALL_TOOLS.map(t => [t.name, t]))('tool "%s" has all required fields', (_name, tool) => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('input_schema');
    });

    it.each(ALL_TOOLS.map(t => [t.name, t]))('tool "%s" has valid input_schema structure', (_name, tool) => {
      const schema = tool.input_schema;
      expect(schema.type).toBe('object');
      expect(schema).toHaveProperty('properties');
      expect(typeof schema.properties).toBe('object');
      expect(Array.isArray(schema.required)).toBe(true);
    });

    it.each(ALL_TOOLS.map(t => [t.name, t]))('tool "%s" has a non-empty name', (_name, tool) => {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.name).toMatch(/^[a-z_]+$/);
    });

    it.each(ALL_TOOLS.map(t => [t.name, t]))('tool "%s" has a description of reasonable length', (_name, tool) => {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.description.length).toBeLessThan(1000);
    });
  });

  // ===========================================
  // Uniqueness
  // ===========================================

  describe('Uniqueness', () => {
    it('should have no duplicate tool names', () => {
      const names = ALL_TOOLS.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('should have no duplicate constant references', () => {
      // Check that all exported constants point to distinct objects
      for (let i = 0; i < ALL_TOOLS.length; i++) {
        for (let j = i + 1; j < ALL_TOOLS.length; j++) {
          expect(ALL_TOOLS[i]).not.toBe(ALL_TOOLS[j]);
        }
      }
    });

    it('should export at least 50 tools', () => {
      expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(50);
    });
  });

  // ===========================================
  // Schema Property Types
  // ===========================================

  describe('Schema Property Types', () => {
    it.each(ALL_TOOLS.map(t => [t.name, t]))('tool "%s" uses valid JSON Schema types for all properties', (_name, tool) => {
      const props = tool.input_schema.properties;
      for (const [propName, propDef] of Object.entries(props)) {
        expect(VALID_SCHEMA_TYPES).toContain(propDef.type);
        // If array type, must have items
        if (propDef.type === 'array') {
          expect(propDef.items).toBeDefined();
          expect(propDef.items?.type).toBeDefined();
        }
      }
    });

    it.each(ALL_TOOLS.map(t => [t.name, t]))('tool "%s" has descriptions for all properties', (_name, tool) => {
      const props = tool.input_schema.properties;
      for (const [propName, propDef] of Object.entries(props)) {
        expect(propDef.description).toBeDefined();
        expect(propDef.description.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================
  // Required Parameters Validation
  // ===========================================

  describe('Required Parameters', () => {
    it.each(ALL_TOOLS.map(t => [t.name, t]))('tool "%s" only lists existing properties as required', (_name, tool) => {
      const propNames = Object.keys(tool.input_schema.properties);
      for (const req of tool.input_schema.required) {
        expect(propNames).toContain(req);
      }
    });

    it('search_ideas requires "query"', () => {
      expect(TOOL_SEARCH_IDEAS.input_schema.required).toContain('query');
    });

    it('create_idea requires title, type, and summary', () => {
      expect(TOOL_CREATE_IDEA.input_schema.required).toEqual(
        expect.arrayContaining(['title', 'type', 'summary'])
      );
    });

    it('execute_code requires code and language', () => {
      expect(TOOL_EXECUTE_CODE.input_schema.required).toEqual(
        expect.arrayContaining(['code', 'language'])
      );
    });

    it('remember requires content and fact_type', () => {
      expect(TOOL_REMEMBER.input_schema.required).toEqual(
        expect.arrayContaining(['content', 'fact_type'])
      );
    });

    it('github_create_issue requires owner, repo, and title', () => {
      expect(TOOL_GITHUB_CREATE_ISSUE.input_schema.required).toEqual(
        expect.arrayContaining(['owner', 'repo', 'title'])
      );
    });

    it('memory_update_profile requires category, fact_key, and fact_value', () => {
      expect(TOOL_MEMORY_UPDATE_PROFILE.input_schema.required).toEqual(
        expect.arrayContaining(['category', 'fact_key', 'fact_value'])
      );
    });
  });

  // ===========================================
  // Enum Values
  // ===========================================

  describe('Enum Values', () => {
    it('create_idea type enum includes standard idea types', () => {
      const typeEnum = TOOL_CREATE_IDEA.input_schema.properties.type.enum;
      expect(typeEnum).toEqual(expect.arrayContaining(['idea', 'task', 'insight', 'problem', 'question']));
    });

    it('execute_code language enum includes supported languages', () => {
      const langEnum = TOOL_EXECUTE_CODE.input_schema.properties.language.enum;
      expect(langEnum).toEqual(expect.arrayContaining(['python', 'nodejs', 'bash']));
    });

    it('remember fact_type enum includes all types', () => {
      const factEnum = TOOL_REMEMBER.input_schema.properties.fact_type.enum;
      expect(factEnum).toEqual(expect.arrayContaining(['preference', 'behavior', 'knowledge', 'goal', 'context']));
    });

    it('navigate_to page enum includes core pages', () => {
      const pageEnum = TOOL_NAVIGATE_TO.input_schema.properties.page.enum;
      expect(pageEnum).toEqual(expect.arrayContaining(['home', 'chat', 'ideas', 'settings', 'calendar', 'email']));
    });

    it('open_panel panel enum includes all panel types', () => {
      const panelEnum = TOOL_OPEN_PANEL.input_schema.properties.panel.enum;
      expect(panelEnum).toEqual(expect.arrayContaining(['tasks', 'email', 'ideas', 'calendar', 'contacts']));
    });

    it('core_memory_read block_type enum includes all block types', () => {
      const blockEnum = TOOL_CORE_MEMORY_READ.input_schema.properties.block_type.enum;
      expect(blockEnum).toEqual(expect.arrayContaining(['user_profile', 'current_goals', 'preferences', 'working_context']));
    });

    it('analyze_document template enum includes all templates', () => {
      const templateEnum = TOOL_ANALYZE_DOCUMENT.input_schema.properties.template.enum;
      expect(templateEnum).toEqual(expect.arrayContaining(['general', 'financial', 'contract', 'data', 'summary']));
    });

    it('memory_restructure action enum includes all actions', () => {
      const actionEnum = TOOL_MEMORY_RESTRUCTURE.input_schema.properties.action.enum;
      expect(actionEnum).toEqual(expect.arrayContaining(['merge', 'split', 'promote', 'demote']));
    });
  });

  // ===========================================
  // Category Groupings
  // ===========================================

  describe('Category Groupings', () => {
    it('all categories have at least one tool', () => {
      for (const [category, tools] of Object.entries(CATEGORIES)) {
        expect(tools.length).toBeGreaterThan(0);
      }
    });

    it('all tools belong to at least one category', () => {
      const categorizedTools = new Set(
        Object.values(CATEGORIES).flat().map(t => t.name)
      );
      for (const tool of ALL_TOOLS) {
        expect(categorizedTools.has(tool.name)).toBe(true);
      }
    });

    it('Core Ideas category has 6 tools', () => {
      expect(CATEGORIES['Core Ideas']).toHaveLength(6);
    });

    it('GitHub category has 5 tools', () => {
      expect(CATEGORIES['GitHub']).toHaveLength(5);
    });

    it('Business category has 7 tools', () => {
      expect(CATEGORIES['Business']).toHaveLength(7);
    });

    it('Memory category has 11 tools (base + self-editing)', () => {
      expect(CATEGORIES['Memory']).toHaveLength(11);
    });

    it('Maps category has 4 tools', () => {
      expect(CATEGORIES['Maps']).toHaveLength(4);
    });
  });

  // ===========================================
  // Specific Tool Definitions
  // ===========================================

  describe('Core Ideas Tools', () => {
    it('search_ideas has query and limit properties', () => {
      const props = Object.keys(TOOL_SEARCH_IDEAS.input_schema.properties);
      expect(props).toContain('query');
      expect(props).toContain('limit');
    });

    it('create_idea has all expected properties', () => {
      const props = Object.keys(TOOL_CREATE_IDEA.input_schema.properties);
      expect(props).toEqual(expect.arrayContaining(['title', 'type', 'summary', 'category', 'priority', 'next_steps']));
    });

    it('update_idea requires only id', () => {
      expect(TOOL_UPDATE_IDEA.input_schema.required).toEqual(['id']);
    });

    it('archive_idea and delete_idea require only id', () => {
      expect(TOOL_ARCHIVE_IDEA.input_schema.required).toEqual(['id']);
      expect(TOOL_DELETE_IDEA.input_schema.required).toEqual(['id']);
    });
  });

  describe('Web Tools', () => {
    it('web_search requires query', () => {
      expect(TOOL_WEB_SEARCH.input_schema.required).toContain('query');
    });

    it('fetch_url requires url', () => {
      expect(TOOL_FETCH_URL.input_schema.required).toContain('url');
    });
  });

  describe('GitHub Tools', () => {
    it('github_repo_info requires owner and repo', () => {
      expect(TOOL_GITHUB_REPO_INFO.input_schema.required).toEqual(expect.arrayContaining(['owner', 'repo']));
    });

    it('github_pr_summary requires owner, repo, and pr_number', () => {
      expect(TOOL_GITHUB_PR_SUMMARY.input_schema.required).toEqual(
        expect.arrayContaining(['owner', 'repo', 'pr_number'])
      );
    });

    it('github_list_issues has state enum', () => {
      const stateEnum = TOOL_GITHUB_LIST_ISSUES.input_schema.properties.state.enum;
      expect(stateEnum).toEqual(expect.arrayContaining(['open', 'closed', 'all']));
    });
  });

  describe('Memory Tools', () => {
    it('recall has memory_type enum', () => {
      const memEnum = TOOL_RECALL.input_schema.properties.memory_type.enum;
      expect(memEnum).toEqual(expect.arrayContaining(['episodes', 'facts', 'all']));
    });

    it('memory_introspect has aspect enum', () => {
      const aspectEnum = TOOL_MEMORY_INTROSPECT.input_schema.properties.aspect.enum;
      expect(aspectEnum).toEqual(expect.arrayContaining(['facts', 'episodes', 'working_memory', 'cross_context', 'overview']));
    });

    it('memory_delete does not require any fields (flexible lookup)', () => {
      expect(TOOL_MEMORY_DELETE.input_schema.required).toEqual([]);
    });

    it('memory_rethink requires fact_id and new_context', () => {
      expect(TOOL_MEMORY_RETHINK.input_schema.required).toEqual(
        expect.arrayContaining(['fact_id', 'new_context'])
      );
    });

    it('memory_replace requires key, new_content, and reason', () => {
      expect(TOOL_MEMORY_REPLACE.input_schema.required).toEqual(
        expect.arrayContaining(['key', 'new_content', 'reason'])
      );
    });

    it('memory_abstract requires fact_ids and instruction', () => {
      expect(TOOL_MEMORY_ABSTRACT.input_schema.required).toEqual(
        expect.arrayContaining(['fact_ids', 'instruction'])
      );
    });

    it('memory_search_and_link has link_type enum', () => {
      const linkEnum = TOOL_MEMORY_SEARCH_AND_LINK.input_schema.properties.link_type.enum;
      expect(linkEnum).toEqual(expect.arrayContaining(['related', 'supports', 'contradicts', 'extends', 'depends_on']));
    });
  });

  describe('Business Tools', () => {
    it('business tools accept optional period parameter', () => {
      const periodTools = [TOOL_GET_REVENUE_METRICS, TOOL_GET_TRAFFIC_ANALYTICS, TOOL_GET_SEO_PERFORMANCE];
      for (const tool of periodTools) {
        expect(tool.input_schema.properties).toHaveProperty('period');
        expect(tool.input_schema.required).toEqual([]);
      }
    });

    it('identify_anomalies has no required parameters', () => {
      expect(TOOL_IDENTIFY_ANOMALIES.input_schema.required).toEqual([]);
      expect(Object.keys(TOOL_IDENTIFY_ANOMALIES.input_schema.properties)).toEqual([]);
    });

    it('compare_periods has metric enum', () => {
      const metricEnum = TOOL_COMPARE_PERIODS.input_schema.properties.metric.enum;
      expect(metricEnum).toEqual(expect.arrayContaining(['all', 'revenue', 'traffic', 'seo']));
    });

    it('generate_business_report has type enum', () => {
      const typeEnum = TOOL_GENERATE_BUSINESS_REPORT.input_schema.properties.type.enum;
      expect(typeEnum).toEqual(expect.arrayContaining(['weekly', 'monthly']));
    });
  });

  describe('Maps Tools', () => {
    it('get_directions has mode enum with transport options', () => {
      const modeEnum = TOOL_GET_DIRECTIONS.input_schema.properties.mode.enum;
      expect(modeEnum).toEqual(expect.arrayContaining(['driving', 'transit', 'walking', 'bicycling']));
    });

    it('find_nearby_places requires location', () => {
      expect(TOOL_FIND_NEARBY.input_schema.required).toContain('location');
    });

    it('optimize_day_route requires locations array', () => {
      expect(TOOL_OPTIMIZE_ROUTE.input_schema.required).toContain('locations');
      expect(TOOL_OPTIMIZE_ROUTE.input_schema.properties.locations.type).toBe('array');
    });
  });

  describe('Calendar/Email Tools', () => {
    it('create_calendar_event requires title and start_time', () => {
      expect(TOOL_CREATE_CALENDAR_EVENT.input_schema.required).toEqual(
        expect.arrayContaining(['title', 'start_time'])
      );
    });

    it('list_calendar_events requires start and end', () => {
      expect(TOOL_LIST_CALENDAR_EVENTS.input_schema.required).toEqual(
        expect.arrayContaining(['start', 'end'])
      );
    });

    it('draft_email requires key_points', () => {
      expect(TOOL_DRAFT_EMAIL.input_schema.required).toContain('key_points');
    });

    it('draft_email has tone enum', () => {
      const toneEnum = TOOL_DRAFT_EMAIL.input_schema.properties.tone.enum;
      expect(toneEnum).toEqual(expect.arrayContaining(['formal', 'informal', 'friendly']));
    });

    it('estimate_travel requires origin and destination', () => {
      expect(TOOL_ESTIMATE_TRAVEL.input_schema.required).toEqual(
        expect.arrayContaining(['origin', 'destination'])
      );
    });
  });

  describe('MCP Tools', () => {
    it('mcp_call_tool requires connection_id and tool_name', () => {
      expect(TOOL_MCP_CALL_TOOL.input_schema.required).toEqual(
        expect.arrayContaining(['connection_id', 'tool_name'])
      );
    });

    it('mcp_list_tools has no required parameters', () => {
      expect(TOOL_MCP_LIST_TOOLS.input_schema.required).toEqual([]);
    });
  });

  describe('Core Memory Tools', () => {
    it('all three core memory tools have block_type property with same enum', () => {
      const expected = ['user_profile', 'current_goals', 'preferences', 'working_context'];
      expect(TOOL_CORE_MEMORY_READ.input_schema.properties.block_type.enum).toEqual(expected);
      expect(TOOL_CORE_MEMORY_UPDATE.input_schema.properties.block_type.enum).toEqual(expected);
      expect(TOOL_CORE_MEMORY_APPEND.input_schema.properties.block_type.enum).toEqual(expected);
    });

    it('core_memory_update requires block_type and content', () => {
      expect(TOOL_CORE_MEMORY_UPDATE.input_schema.required).toEqual(
        expect.arrayContaining(['block_type', 'content'])
      );
    });

    it('core_memory_append requires block_type and text', () => {
      expect(TOOL_CORE_MEMORY_APPEND.input_schema.required).toEqual(
        expect.arrayContaining(['block_type', 'text'])
      );
    });
  });

  describe('UI Tools', () => {
    it('open_panel requires panel', () => {
      expect(TOOL_OPEN_PANEL.input_schema.required).toContain('panel');
    });

    it('open_panel has optional filter property', () => {
      expect(TOOL_OPEN_PANEL.input_schema.properties).toHaveProperty('filter');
      expect(TOOL_OPEN_PANEL.input_schema.required).not.toContain('filter');
    });
  });
});
