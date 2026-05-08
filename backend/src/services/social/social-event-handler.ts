/**
 * Social Event Handler
 *
 * Subscribes to system events (blog_published, phase_completed) and
 * triggers the ContentAgent to draft social media posts automatically.
 *
 * Integrates with the Proactive Decision Engine via the plugin event bus
 * for real-time event handling, while also supporting DB-persisted
 * proactive rules for user-configurable behavior.
 *
 * @module services/social/social-event-handler
 */

import { subscribe } from '../plugins/event-bus';
import { createContentAgent } from './content-agent';
import { logger } from '../../utils/logger';
import type { AIContext } from '../../utils/database-context';
import type { PluginEvent } from '../plugins/plugin-types';
import type { SourceType } from './platform-types';

// ===========================================
// Event Handler
// ===========================================

/**
 * Handle blog_published events — draft posts for all platforms.
 */
async function handleBlogPublished(event: PluginEvent): Promise<void> {
  const context = (event.context || 'finance') as AIContext;
  const { title, slug, content, excerpt, url } = event.data as Record<string, string>;

  if (!content && !excerpt) {
    logger.warn('[SocialEventHandler] blog_published event missing content/excerpt', { slug });
    return;
  }

  const sourceContent = buildBlogSourceContent(title, excerpt || content, url);

  logger.info('[SocialEventHandler] Drafting social posts for blog', { slug, context });

  try {
    const agent = createContentAgent();
    const results = await agent.draftForAllPlatforms(sourceContent, 'blog' as SourceType, context);

    logger.info('[SocialEventHandler] Blog posts drafted', {
      slug,
      platforms: results.map(r => r.platform),
      count: results.length,
    });
  } catch (error) {
    logger.error(
      '[SocialEventHandler] Failed to draft blog posts',
      error instanceof Error ? error : undefined,
      { slug, context },
    );
  }
}

/**
 * Handle phase_completed events — draft changelog thread for all platforms.
 */
async function handlePhaseCompleted(event: PluginEvent): Promise<void> {
  const context = (event.context || 'finance') as AIContext;
  const { phase, title, highlights, changelog } = event.data as Record<string, unknown>;

  const phaseNum = phase ?? 'unknown';
  const sourceContent = buildPhaseSourceContent(
    phaseNum,
    title as string | undefined,
    highlights as string[] | undefined,
    changelog as string | undefined,
  );

  logger.info('[SocialEventHandler] Drafting social posts for phase completion', { phase: phaseNum, context });

  try {
    const agent = createContentAgent();
    const results = await agent.draftForAllPlatforms(sourceContent, 'changelog' as SourceType, context);

    logger.info('[SocialEventHandler] Phase completion posts drafted', {
      phase: phaseNum,
      platforms: results.map(r => r.platform),
      count: results.length,
    });
  } catch (error) {
    logger.error(
      '[SocialEventHandler] Failed to draft phase completion posts',
      error instanceof Error ? error : undefined,
      { phase: phaseNum, context },
    );
  }
}

/**
 * Handle weekly_summary events — draft weekly activity summary posts for all platforms.
 */
async function handleWeeklySummary(event: PluginEvent): Promise<void> {
  const context = (event.context || 'finance') as AIContext;
  logger.info('[SocialEventHandler] Generating weekly summary drafts', { context });

  try {
    const agent = createContentAgent();
    const results = await agent.draftWeeklySummary(context);
    logger.info('[SocialEventHandler] Weekly summary drafted', {
      platforms: results.map(r => r.platform),
      count: results.length,
    });
  } catch (error) {
    logger.error('[SocialEventHandler] Failed to draft weekly summary',
      error instanceof Error ? error : undefined, { context });
  }
}

// ===========================================
// Content Builders
// ===========================================

function buildBlogSourceContent(title: string | undefined, body: string, url: string | undefined): string {
  const parts: string[] = [];
  if (title) parts.push(`# ${title}`);
  parts.push(body.substring(0, 3000)); // Limit source to 3K chars
  if (url) parts.push(`\nLink: ${url}`);
  return parts.join('\n\n');
}

function buildPhaseSourceContent(
  phase: unknown,
  title: string | undefined,
  highlights: string[] | undefined,
  changelog: string | undefined,
): string {
  const parts: string[] = [];
  parts.push(`# Phase ${phase}${title ? `: ${title}` : ''}`);

  if (highlights && highlights.length > 0) {
    parts.push('Key highlights:');
    parts.push(highlights.map(h => `- ${h}`).join('\n'));
  }

  if (changelog) {
    parts.push(changelog.substring(0, 3000));
  }

  return parts.join('\n\n');
}

// ===========================================
// Registration
// ===========================================

let _registered = false;

/**
 * Register social media event handlers on the plugin event bus.
 * Safe to call multiple times — handlers are only registered once.
 */
export function registerSocialEventHandlers(): void {
  if (_registered) return;
  _registered = true;

  subscribe('blog_published', (event: PluginEvent) => {
    // Fire-and-forget — don't block the event bus
    handleBlogPublished(event).catch(err => {
      logger.error('[SocialEventHandler] Unhandled error in blog_published handler',
        err instanceof Error ? err : undefined);
    });
  });

  subscribe('phase_completed', (event: PluginEvent) => {
    handlePhaseCompleted(event).catch(err => {
      logger.error('[SocialEventHandler] Unhandled error in phase_completed handler',
        err instanceof Error ? err : undefined);
    });
  });

  subscribe('weekly_summary', (event: PluginEvent) => {
    handleWeeklySummary(event).catch(err => {
      logger.error('[SocialEventHandler] Unhandled error in weekly_summary handler',
        err instanceof Error ? err : undefined);
    });
  });

  logger.info('[SocialEventHandler] Registered event handlers for blog_published, phase_completed, weekly_summary');
}
