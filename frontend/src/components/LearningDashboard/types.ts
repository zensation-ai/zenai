export interface LearningDashboardProps {
  context: string;
  onBack: () => void;
}

export interface DomainFocus {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  learning_goals: string[];
  is_active: boolean;
  priority: number;
  ideas_count: number;
  last_activity_at: string | null;
}

export interface FocusStats {
  total_focus_areas: number;
  active_focus_areas: number;
  total_ideas_linked: number;
}

export interface FeedbackStats {
  total_feedback: number;
  average_rating: number;
  corrections_count: number;
  applied_count: number;
}

export interface FeedbackInsight {
  pattern: string;
  frequency: number;
  suggested_improvement: string;
}

export interface ProactiveResearch {
  id: string;
  research_query: string;
  teaser_title: string | null;
  teaser_text: string | null;
  status: string;
  created_at: string;
}

export interface AISuggestion {
  id: string;
  suggestion_type: string;
  title: string;
  description: string | null;
  reasoning: string | null;
  priority: number;
  status: string;
  created_at: string;
}

export interface LearningLog {
  id: string;
  learning_date: string;
  ideas_analyzed: number;
  patterns_found: number;
  suggestions_generated: number;
  status: string;
}

export interface ProfileStats {
  profile_completeness: number;
  topics_tracked: number;
  top_topics: Array<{ topic: string; count: number }>;
  tech_stack_count: number;
  insights_count: number;
  last_updated: string | null;
}

export interface DashboardData {
  focus: {
    active_areas: DomainFocus[];
    stats: FocusStats;
  };
  feedback: {
    stats: FeedbackStats;
    insights: FeedbackInsight[];
  };
  research: {
    pending: ProactiveResearch[];
  };
  suggestions: {
    active: AISuggestion[];
  };
  learning: {
    recent_logs: LearningLog[];
  };
  profile?: {
    stats: ProfileStats;
  };
}

export interface ProfileData {
  company_name?: string;
  industry?: string;
  role?: string;
  tech_stack?: string[];
  pain_points?: string[];
  goals?: string[];
}
