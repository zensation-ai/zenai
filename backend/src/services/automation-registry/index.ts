/**
 * Automation Registry Service
 *
 * Zentrale Verwaltung für Automationen und Workflows.
 * Das System lernt welche Automationen nützlich sind und schlägt neue vor.
 */

// Core: Types, CRUD, Execution
export {
  // Types
  type TriggerType,
  type ActionType,
  type AutomationTrigger,
  type AutomationAction,
  type AutomationCondition,
  type AutomationDefinition,
  type AutomationSuggestion,
  type AutomationExecution,
  type AutomationStats,
  // CRUD
  registerAutomation,
  updateAutomation,
  deleteAutomation,
  getAutomation,
  listAutomations,
  // Execution
  executeAutomation,
} from './automation-core';

// Suggestions: Pattern analysis + suggestion CRUD
export {
  generateAutomationSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  getPendingSuggestions,
} from './automation-suggestions';

// Analytics: Stats + execution history
export {
  getAutomationStats,
  getExecutionHistory,
} from './automation-analytics';
