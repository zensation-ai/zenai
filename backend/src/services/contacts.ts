/**
 * Contacts Service - Phase 3
 *
 * Context-aware contact and organization management.
 * Adapted from ZenCRM patterns for ZenAI's personal AI context.
 */

import { queryContext, AIContext, QueryParam } from '../utils/database-context';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

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
  // Joined fields
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
  // Computed
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

export interface ContactFilters {
  search?: string;
  relationship_type?: string;
  organization_id?: string;
  tag?: string;
  is_favorite?: boolean;
  limit?: number;
  offset?: number;
}

export interface OrganizationFilters {
  search?: string;
  industry?: string;
  limit?: number;
  offset?: number;
}

export interface CreateContactInput {
  display_name: string;
  first_name?: string;
  last_name?: string;
  email?: string[];
  phone?: string[];
  organization_id?: string;
  role?: string;
  relationship_type?: RelationshipType;
  avatar_url?: string;
  notes?: string;
  tags?: string[];
  source?: string;
  is_favorite?: boolean;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  social_links?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface CreateOrganizationInput {
  name: string;
  industry?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  employee_count?: number;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateInteractionInput {
  contact_id: string;
  interaction_type: InteractionType;
  direction?: string;
  subject?: string;
  summary?: string;
  source_id?: string;
  source_type?: string;
  interaction_at?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Contacts CRUD
// ============================================================

export async function createContact(
  context: AIContext,
  input: CreateContactInput
): Promise<Contact> {
  const result = await queryContext(context, `
    INSERT INTO contacts (
      display_name, first_name, last_name, email, phone,
      organization_id, role, relationship_type, avatar_url, notes,
      tags, source, is_favorite, address, city, postal_code, country,
      social_links, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *
  `, [
    input.display_name,
    input.first_name || null,
    input.last_name || null,
    input.email || [],
    input.phone || [],
    input.organization_id || null,
    input.role || null,
    input.relationship_type || 'other',
    input.avatar_url || null,
    input.notes || null,
    input.tags || [],
    input.source || null,
    input.is_favorite || false,
    input.address || null,
    input.city || null,
    input.postal_code || null,
    input.country || null,
    JSON.stringify(input.social_links || {}),
    JSON.stringify(input.metadata || {}),
  ]);

  logger.info('Contact created', { context, contactId: result.rows[0].id });
  return result.rows[0];
}

export async function getContacts(
  context: AIContext,
  filters: ContactFilters = {}
): Promise<{ contacts: Contact[]; total: number }> {
  const conditions: string[] = [];
  const params: QueryParam[] = [];
  let paramIndex = 1;

  if (filters.search) {
    conditions.push(`(
      c.display_name ILIKE $${paramIndex}
      OR c.first_name ILIKE $${paramIndex}
      OR c.last_name ILIKE $${paramIndex}
      OR EXISTS (SELECT 1 FROM unnest(c.email) e WHERE e ILIKE $${paramIndex})
      OR c.notes ILIKE $${paramIndex}
    )`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  if (filters.relationship_type) {
    conditions.push(`c.relationship_type = $${paramIndex++}`);
    params.push(filters.relationship_type);
  }

  if (filters.organization_id) {
    conditions.push(`c.organization_id = $${paramIndex++}`);
    params.push(filters.organization_id);
  }

  if (filters.tag) {
    conditions.push(`$${paramIndex++} = ANY(c.tags)`);
    params.push(filters.tag);
  }

  if (filters.is_favorite !== undefined) {
    conditions.push(`c.is_favorite = $${paramIndex++}`);
    params.push(filters.is_favorite);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  const [dataResult, countResult] = await Promise.all([
    queryContext(context, `
      SELECT c.*, o.name as organization_name
      FROM contacts c
      LEFT JOIN organizations o ON c.organization_id = o.id
      ${whereClause}
      ORDER BY c.is_favorite DESC, c.display_name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]),
    queryContext(context, `
      SELECT COUNT(*) as total FROM contacts c ${whereClause}
    `, params),
  ]);

  return {
    contacts: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
  };
}

export async function getContact(
  context: AIContext,
  id: string
): Promise<Contact | null> {
  const result = await queryContext(context, `
    SELECT c.*, o.name as organization_name
    FROM contacts c
    LEFT JOIN organizations o ON c.organization_id = o.id
    WHERE c.id = $1
  `, [id]);
  return result.rows[0] || null;
}

export async function updateContact(
  context: AIContext,
  id: string,
  updates: Partial<CreateContactInput>
): Promise<Contact | null> {
  const sets: string[] = [];
  const params: QueryParam[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, unknown> = {
    display_name: updates.display_name,
    first_name: updates.first_name,
    last_name: updates.last_name,
    email: updates.email,
    phone: updates.phone,
    organization_id: updates.organization_id,
    role: updates.role,
    relationship_type: updates.relationship_type,
    avatar_url: updates.avatar_url,
    notes: updates.notes,
    tags: updates.tags,
    source: updates.source,
    is_favorite: updates.is_favorite,
    address: updates.address,
    city: updates.city,
    postal_code: updates.postal_code,
    country: updates.country,
  };

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      sets.push(`${key} = $${paramIndex++}`);
      params.push(value as QueryParam);
    }
  }

  if (updates.social_links !== undefined) {
    sets.push(`social_links = $${paramIndex++}`);
    params.push(JSON.stringify(updates.social_links));
  }
  if (updates.metadata !== undefined) {
    sets.push(`metadata = $${paramIndex++}`);
    params.push(JSON.stringify(updates.metadata));
  }

  if (sets.length === 0) return getContact(context, id);

  sets.push('updated_at = NOW()');

  const result = await queryContext(context, `
    UPDATE contacts SET ${sets.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `, [...params, id]);

  return result.rows[0] || null;
}

export async function deleteContact(
  context: AIContext,
  id: string
): Promise<boolean> {
  const result = await queryContext(context,
    'DELETE FROM contacts WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// Organizations CRUD
// ============================================================

export async function createOrganization(
  context: AIContext,
  input: CreateOrganizationInput
): Promise<Organization> {
  const result = await queryContext(context, `
    INSERT INTO organizations (name, industry, website, email, phone, address, city, postal_code, country, employee_count, notes, tags, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [
    input.name,
    input.industry || null,
    input.website || null,
    input.email || null,
    input.phone || null,
    input.address || null,
    input.city || null,
    input.postal_code || null,
    input.country || null,
    input.employee_count || null,
    input.notes || null,
    input.tags || [],
    JSON.stringify(input.metadata || {}),
  ]);

  return result.rows[0];
}

export async function getOrganizations(
  context: AIContext,
  filters: OrganizationFilters = {}
): Promise<{ organizations: Organization[]; total: number }> {
  const conditions: string[] = [];
  const params: QueryParam[] = [];
  let paramIndex = 1;

  if (filters.search) {
    conditions.push(`(o.name ILIKE $${paramIndex} OR o.industry ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  if (filters.industry) {
    conditions.push(`o.industry = $${paramIndex++}`);
    params.push(filters.industry);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  const [dataResult, countResult] = await Promise.all([
    queryContext(context, `
      SELECT o.*, (SELECT COUNT(*) FROM contacts c WHERE c.organization_id = o.id) as contact_count
      FROM organizations o
      ${whereClause}
      ORDER BY o.name ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]),
    queryContext(context, `
      SELECT COUNT(*) as total FROM organizations o ${whereClause}
    `, params),
  ]);

  return {
    organizations: dataResult.rows.map(row => ({
      ...row,
      contact_count: parseInt(row.contact_count || '0', 10),
    })),
    total: parseInt(countResult.rows[0]?.total || '0', 10),
  };
}

export async function getOrganization(
  context: AIContext,
  id: string
): Promise<Organization | null> {
  const result = await queryContext(context, `
    SELECT o.*, (SELECT COUNT(*) FROM contacts c WHERE c.organization_id = o.id) as contact_count
    FROM organizations o
    WHERE o.id = $1
  `, [id]);
  if (!result.rows[0]) return null;
  return {
    ...result.rows[0],
    contact_count: parseInt(result.rows[0].contact_count || '0', 10),
  };
}

export async function updateOrganization(
  context: AIContext,
  id: string,
  updates: Partial<CreateOrganizationInput>
): Promise<Organization | null> {
  const sets: string[] = [];
  const params: QueryParam[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, unknown> = {
    name: updates.name,
    industry: updates.industry,
    website: updates.website,
    email: updates.email,
    phone: updates.phone,
    address: updates.address,
    city: updates.city,
    postal_code: updates.postal_code,
    country: updates.country,
    employee_count: updates.employee_count,
    notes: updates.notes,
    tags: updates.tags,
  };

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      sets.push(`${key} = $${paramIndex++}`);
      params.push(value as QueryParam);
    }
  }

  if (updates.metadata !== undefined) {
    sets.push(`metadata = $${paramIndex++}`);
    params.push(JSON.stringify(updates.metadata));
  }

  if (sets.length === 0) return getOrganization(context, id);

  sets.push('updated_at = NOW()');

  const result = await queryContext(context, `
    UPDATE organizations SET ${sets.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `, [...params, id]);

  return result.rows[0] || null;
}

export async function deleteOrganization(
  context: AIContext,
  id: string
): Promise<boolean> {
  const result = await queryContext(context,
    'DELETE FROM organizations WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// Contact Interactions (Timeline)
// ============================================================

export async function addInteraction(
  context: AIContext,
  input: CreateInteractionInput
): Promise<ContactInteraction> {
  const result = await queryContext(context, `
    INSERT INTO contact_interactions (contact_id, interaction_type, direction, subject, summary, source_id, source_type, interaction_at, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    input.contact_id,
    input.interaction_type,
    input.direction || null,
    input.subject || null,
    input.summary || null,
    input.source_id || null,
    input.source_type || null,
    input.interaction_at || new Date().toISOString(),
    JSON.stringify(input.metadata || {}),
  ]);

  // Update contact's last interaction
  await queryContext(context, `
    UPDATE contacts SET
      last_interaction_at = $2,
      interaction_count = interaction_count + 1,
      updated_at = NOW()
    WHERE id = $1
  `, [input.contact_id, input.interaction_at || new Date().toISOString()]);

  return result.rows[0];
}

export async function getInteractions(
  context: AIContext,
  contactId: string,
  limit = 50,
  offset = 0
): Promise<{ interactions: ContactInteraction[]; total: number }> {
  const [dataResult, countResult] = await Promise.all([
    queryContext(context, `
      SELECT * FROM contact_interactions
      WHERE contact_id = $1
      ORDER BY interaction_at DESC
      LIMIT $2 OFFSET $3
    `, [contactId, limit, offset]),
    queryContext(context, `
      SELECT COUNT(*) as total FROM contact_interactions WHERE contact_id = $1
    `, [contactId]),
  ]);

  return {
    interactions: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
  };
}

// ============================================================
// Follow-up Suggestions
// ============================================================

export async function getFollowUpSuggestions(
  context: AIContext,
  daysThreshold = 30,
  limit = 10
): Promise<Contact[]> {
  const result = await queryContext(context, `
    SELECT c.*, o.name as organization_name
    FROM contacts c
    LEFT JOIN organizations o ON c.organization_id = o.id
    WHERE c.last_interaction_at IS NOT NULL
      AND c.last_interaction_at < NOW() - INTERVAL '1 day' * $1
      AND c.relationship_type IN ('colleague', 'friend', 'client', 'mentor', 'mentee')
    ORDER BY c.last_interaction_at ASC
    LIMIT $2
  `, [daysThreshold, limit]);

  return result.rows;
}

// ============================================================
// Statistics
// ============================================================

export async function getContactStats(
  context: AIContext
): Promise<{
  total_contacts: number;
  total_organizations: number;
  by_relationship: Array<{ relationship_type: string; count: number }>;
  favorites: number;
  recent_interactions: number;
}> {
  const [contactsResult, orgsResult, relResult, favResult, recentResult] = await Promise.all([
    queryContext(context, 'SELECT COUNT(*) as total FROM contacts'),
    queryContext(context, 'SELECT COUNT(*) as total FROM organizations'),
    queryContext(context, `
      SELECT relationship_type, COUNT(*) as count
      FROM contacts
      GROUP BY relationship_type
      ORDER BY count DESC
    `),
    queryContext(context, 'SELECT COUNT(*) as total FROM contacts WHERE is_favorite = TRUE'),
    queryContext(context, `
      SELECT COUNT(*) as total FROM contact_interactions
      WHERE interaction_at >= NOW() - INTERVAL '7 days'
    `),
  ]);

  return {
    total_contacts: parseInt(contactsResult.rows[0]?.total || '0', 10),
    total_organizations: parseInt(orgsResult.rows[0]?.total || '0', 10),
    by_relationship: relResult.rows.map(r => ({
      relationship_type: r.relationship_type,
      count: parseInt(r.count, 10),
    })),
    favorites: parseInt(favResult.rows[0]?.total || '0', 10),
    recent_interactions: parseInt(recentResult.rows[0]?.total || '0', 10),
  };
}
