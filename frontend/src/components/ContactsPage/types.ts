/**
 * Contacts Page Types - Phase 3
 */

export type RelationshipType =
  | 'colleague' | 'friend' | 'family' | 'client'
  | 'vendor' | 'mentor' | 'mentee' | 'acquaintance' | 'other';

export type InteractionType =
  | 'email' | 'meeting' | 'call' | 'message' | 'task' | 'note';

export interface Contact {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string[];
  phone: string[];
  organization_id: string | null;
  role: string | null;
  relationship_type: RelationshipType;
  avatar_url: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  last_interaction_at: string | null;
  interaction_count: number;
  ai_summary: string | null;
  is_favorite: boolean;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  social_links: Record<string, string>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  organization_name?: string;
}

export interface Organization {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  employee_count: number | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  contact_count?: number;
}

export interface ContactInteraction {
  id: string;
  contact_id: string;
  interaction_type: InteractionType;
  direction: string | null;
  subject: string | null;
  summary: string | null;
  source_id: string | null;
  source_type: string | null;
  interaction_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ContactStats {
  total_contacts: number;
  total_organizations: number;
  by_relationship: Array<{ relationship_type: string; count: number }>;
  favorites: number;
  recent_interactions: number;
}

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  colleague: 'Kollege',
  friend: 'Freund',
  family: 'Familie',
  client: 'Kunde',
  vendor: 'Lieferant',
  mentor: 'Mentor',
  mentee: 'Mentee',
  acquaintance: 'Bekannter',
  other: 'Sonstige',
};

export const INTERACTION_LABELS: Record<InteractionType, { label: string; icon: string }> = {
  email: { label: 'E-Mail', icon: '✉️' },
  meeting: { label: 'Meeting', icon: '📅' },
  call: { label: 'Anruf', icon: '📞' },
  message: { label: 'Nachricht', icon: '💬' },
  task: { label: 'Aufgabe', icon: '✅' },
  note: { label: 'Notiz', icon: '📝' },
};
