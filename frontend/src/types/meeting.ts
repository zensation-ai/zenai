import type { IdeaPriority } from './idea';

export interface ActionItem {
  task: string;
  assignee?: string;
  due_date?: string;
  priority: IdeaPriority;
  completed: boolean;
}

export interface FollowUp {
  topic: string;
  responsible?: string;
  deadline?: string;
}

export interface MeetingNotes {
  id: string;
  meeting_id: string;
  raw_transcript: string;
  structured_summary: string;
  key_decisions: string[];
  action_items: ActionItem[];
  topics_discussed: string[];
  follow_ups: FollowUp[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  created_at: string;
}
