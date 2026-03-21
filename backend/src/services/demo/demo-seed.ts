/**
 * Demo Seed Service
 *
 * Populates and clears the demo schema with realistic data for
 * the "Startup-Gründer Alexander" persona used in interactive demo mode.
 *
 * Usage:
 *   await seedDemoData();   // idempotent – clears first, then inserts
 *   await clearDemoData();  // removes all demo user's data
 */

import { queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import {
  DEMO_USER_ID,
  DEMO_IDEAS,
  DEMO_PROJECTS,
  DEMO_TASKS,
  DEMO_CONTACTS,
  DEMO_MEMORY_FACTS,
} from './demo-data';

// ─── Clear ────────────────────────────────────────────────────────────────────

/**
 * Deletes all rows belonging to the demo user from the demo schema.
 * Tables are cleared in reverse dependency order to avoid FK violations.
 */
export async function clearDemoData(): Promise<void> {
  logger.info('[demo-seed] Clearing demo data…');

  // Tasks depend on projects, so tasks first
  await queryContext(
    'demo',
    'DELETE FROM tasks WHERE user_id = $1',
    [DEMO_USER_ID],
  );

  await queryContext(
    'demo',
    'DELETE FROM projects WHERE user_id = $1',
    [DEMO_USER_ID],
  );

  await queryContext(
    'demo',
    'DELETE FROM ideas WHERE user_id = $1',
    [DEMO_USER_ID],
  );

  // Contacts depend on organizations only via organization_id (nullable), so contacts first
  await queryContext(
    'demo',
    'DELETE FROM contacts WHERE user_id = $1',
    [DEMO_USER_ID],
  );

  await queryContext(
    'demo',
    'DELETE FROM learned_facts WHERE user_id = $1',
    [DEMO_USER_ID],
  );

  logger.info('[demo-seed] Demo data cleared.');
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Seeds the demo schema with realistic German-language demo data.
 * Calls clearDemoData() first to ensure idempotency.
 */
export async function seedDemoData(): Promise<void> {
  logger.info('[demo-seed] Starting demo data seed…');

  await clearDemoData();

  await seedIdeas();
  await seedProjects();
  await seedTasks();
  await seedContacts();
  await seedMemoryFacts();

  logger.info('[demo-seed] Demo data seed complete.');
}

// ─── Individual seeders ───────────────────────────────────────────────────────

async function seedIdeas(): Promise<void> {
  logger.info(`[demo-seed] Seeding ${DEMO_IDEAS.length} ideas…`);

  for (const idea of DEMO_IDEAS) {
    await queryContext(
      'demo',
      `INSERT INTO ideas (
        id, title, summary, type, category, priority,
        is_archived, context, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING`,
      [
        idea.id,
        idea.title,
        idea.summary,
        idea.type,
        idea.category,
        idea.priority,
        idea.is_archived,
        idea.context,
        idea.user_id,
      ],
    );
  }

  logger.info('[demo-seed] Ideas seeded.');
}

async function seedProjects(): Promise<void> {
  logger.info(`[demo-seed] Seeding ${DEMO_PROJECTS.length} projects…`);

  for (const project of DEMO_PROJECTS) {
    await queryContext(
      'demo',
      `INSERT INTO projects (
        id, name, description, color, icon, status, context, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING`,
      [
        project.id,
        project.name,
        project.description,
        project.color,
        project.icon,
        project.status,
        project.context,
        project.user_id,
      ],
    );
  }

  logger.info('[demo-seed] Projects seeded.');
}

async function seedTasks(): Promise<void> {
  logger.info(`[demo-seed] Seeding ${DEMO_TASKS.length} tasks…`);

  for (const task of DEMO_TASKS) {
    await queryContext(
      'demo',
      `INSERT INTO tasks (
        id, title, description, status, priority, project_id, context, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO NOTHING`,
      [
        task.id,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.project_id,
        task.context,
        task.user_id,
      ],
    );
  }

  logger.info('[demo-seed] Tasks seeded.');
}

async function seedContacts(): Promise<void> {
  logger.info(`[demo-seed] Seeding ${DEMO_CONTACTS.length} contacts…`);

  for (const contact of DEMO_CONTACTS) {
    await queryContext(
      'demo',
      `INSERT INTO contacts (
        id, display_name, first_name, last_name, email,
        role, relationship_type, notes, tags, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING`,
      [
        contact.id,
        contact.display_name,
        contact.first_name,
        contact.last_name,
        contact.email,
        contact.role,
        contact.relationship_type,
        contact.notes,
        contact.tags,
        contact.user_id,
      ],
    );
  }

  logger.info('[demo-seed] Contacts seeded.');
}

async function seedMemoryFacts(): Promise<void> {
  logger.info(`[demo-seed] Seeding ${DEMO_MEMORY_FACTS.length} memory facts…`);

  for (const fact of DEMO_MEMORY_FACTS) {
    await queryContext(
      'demo',
      `INSERT INTO learned_facts (
        id, fact_type, content, confidence, source, context, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [
        fact.id,
        fact.fact_type,
        fact.content,
        fact.confidence,
        fact.source,
        fact.context,
        fact.user_id,
      ],
    );
  }

  logger.info('[demo-seed] Memory facts seeded.');
}
