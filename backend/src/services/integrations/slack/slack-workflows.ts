/**
 * Slack Workflow Templates
 *
 * Pre-built autonomous workflow templates that integrate with the
 * ProactiveEngine's rule system. Each template creates a proactive rule
 * that triggers on Slack events with governance-controlled approval.
 */

import type { SlackWorkflowTemplate, AIContext } from './types';
import {
  createProactiveRule,
  listProactiveRules,
  deleteProactiveRule,
} from '../../proactive-decision-engine';
import { logger } from '../../../utils/logger';

const SLACK_RULE_TAG = '[Slack]';

export function getWorkflowTemplates(): SlackWorkflowTemplate[] {
  return [
    {
      name: 'Channel Digest',
      description: `${SLACK_RULE_TAG} Summarize channels with >20 unread messages`,
      eventTypes: ['system.daily_digest'],
      conditions: [],
      decision: 'take_action',
      actionConfig: { action: 'slack_channel_digest', minUnread: 20 },
      riskLevel: 'low',
      requiresApproval: false,
    },
    {
      name: 'Task Extraction',
      description: `${SLACK_RULE_TAG} Extract tasks from messages with action words`,
      eventTypes: ['integration.slack.message_received'],
      conditions: [
        { field: 'payload.text', operator: 'regex', value: '(?i)(TODO|bitte|deadline|aufgabe|task|erledigen)' },
      ],
      decision: 'take_action',
      actionConfig: { action: 'create_task_from_slack' },
      riskLevel: 'medium',
      requiresApproval: true,
    },
    {
      name: 'Email Draft',
      description: `${SLACK_RULE_TAG} Draft email from Slack thread context`,
      eventTypes: ['integration.slack.message_received'],
      conditions: [
        { field: 'payload.text', operator: 'regex', value: '(?i)(email|schreib|draft|mail)' },
      ],
      decision: 'take_action',
      actionConfig: { action: 'draft_email_from_slack' },
      riskLevel: 'medium',
      requiresApproval: true,
    },
    {
      name: 'Meeting Notes',
      description: `${SLACK_RULE_TAG} Extract action items from meeting channels`,
      eventTypes: ['integration.slack.message_received'],
      conditions: [
        { field: 'payload.channel_name', operator: 'regex', value: '(?i)(meeting|notes|standup|retro)' },
      ],
      decision: 'take_action',
      actionConfig: { action: 'extract_meeting_notes' },
      riskLevel: 'low',
      requiresApproval: false,
    },
    {
      name: 'Cross-Context Alert',
      description: `${SLACK_RULE_TAG} Alert when Slack message references ZenAI content`,
      eventTypes: ['integration.slack.message_received'],
      conditions: [],
      decision: 'notify',
      actionConfig: { action: 'cross_context_alert' },
      riskLevel: 'low',
      requiresApproval: false,
    },
    {
      name: 'Agent Delegation',
      description: `${SLACK_RULE_TAG} Delegate complex DM requests to agent team`,
      eventTypes: ['integration.slack.dm_received'],
      conditions: [],
      decision: 'trigger_agent',
      actionConfig: { action: 'delegate_to_agent', minWords: 50 },
      riskLevel: 'high',
      requiresApproval: true,
    },
  ];
}

export async function installWorkflowTemplates(context: AIContext): Promise<void> {
  const templates = getWorkflowTemplates();

  for (const template of templates) {
    try {
      await createProactiveRule(context, {
        name: template.name,
        description: template.description,
        eventTypes: template.eventTypes,
        conditions: template.conditions,
        decision: template.decision,
        actionConfig: template.actionConfig,
        riskLevel: template.riskLevel,
        requiresApproval: template.requiresApproval,
        priority: 50,
        cooldownMinutes: template.riskLevel === 'low' ? 5 : 15,
        isActive: true,
      });
    } catch (err) {
      logger.error('Failed to install Slack workflow template', err instanceof Error ? err : undefined, { name: template.name });
    }
  }

  logger.info('Slack workflow templates installed', { count: templates.length, context });
}

export async function removeWorkflowTemplates(context: AIContext): Promise<void> {
  try {
    const rules = await listProactiveRules(context);
    const slackRules = rules.filter((r: { description: string | null }) =>
      r.description?.includes(SLACK_RULE_TAG),
    );

    for (const rule of slackRules) {
      await deleteProactiveRule(context, rule.id);
    }

    logger.info('Slack workflow templates removed', { count: slackRules.length, context });
  } catch (err) {
    logger.error('Failed to remove Slack workflow templates', err instanceof Error ? err : undefined, { context });
  }
}
