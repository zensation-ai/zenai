/**
 * Contact & CRM types (Phase 3: Contacts & Relationship Intelligence)
 */

export type RelationshipType = 'colleague' | 'friend' | 'family' | 'client' | 'vendor' | 'partner' | 'acquaintance' | 'other';
export type InteractionType = 'email' | 'meeting' | 'call' | 'message' | 'task' | 'note';

export interface Contact {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  email: string[];
  phone?: string[];
  organization_id?: string;
  organization_name?: string;
  role?: string;
  relationship_type?: RelationshipType;
  avatar_url?: string;
  notes?: string;
  tags?: string[];
  last_interaction_at?: string;
  interaction_count: number;
  ai_summary?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface Organization {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  address?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ContactInteraction {
  id: string;
  contact_id: string;
  interaction_type: InteractionType;
  direction?: 'inbound' | 'outbound';
  subject?: string;
  summary?: string;
  source_id?: string;
  source_type?: string;
  interaction_at: string;
  metadata?: Record<string, unknown>;
}
