/**
 * Proactive Intelligence types (Phase 6)
 */

export type BriefingType = 'morning' | 'evening' | 'meeting_prep' | 'follow_up';
export type WorkflowTriggerType = 'after_meeting' | 'time_of_day' | 'email_received' | 'task_completed' | 'calendar_event' | 'pattern_detected';

export interface ProactiveBriefing {
  id: string;
  briefing_type: BriefingType;
  content: BriefingContent;
  generated_at: string;
  read_at?: string;
  acted_on?: string[];
}

export interface BriefingContent {
  greeting?: string;
  calendar_summary?: {
    meetings_count: number;
    meetings: Array<{ title: string; time: string; attendees?: string[] }>;
  };
  tasks_summary?: {
    due_today: number;
    high_priority: number;
    overdue: number;
  };
  email_summary?: {
    unread: number;
    urgent: number;
    highlights?: Array<{ from: string; subject: string; priority: string }>;
  };
  follow_ups?: Array<{
    contact_name: string;
    last_interaction: string;
    days_since: number;
    suggested_action: string;
  }>;
  meeting_prep?: {
    meeting_title: string;
    attendees: string[];
    recent_emails: string[];
    open_tasks: string[];
    last_meeting_summary?: string;
    relevant_docs?: string[];
  };
  insights?: string[];
}

export interface WorkflowPattern {
  id: string;
  pattern_name: string;
  trigger_type: WorkflowTriggerType;
  trigger_conditions?: Record<string, unknown>;
  suggested_actions?: Record<string, unknown>[];
  confidence: number;
  occurrence_count: number;
  last_seen_at?: string;
  is_confirmed: boolean;
  is_automated: boolean;
  created_at: string;
}
