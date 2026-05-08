/**
 * Content Agent
 *
 * AI-powered agent that drafts social media posts from blog,
 * changelog, or idea content using Claude via BaseAgent.
 *
 * @module services/social/content-agent
 */

import { BaseAgent, AgentConfig, AgentInput } from '../agents/base-agent';
import { AIContext, queryContext } from '../../utils/database-context';
import { createPostDraft } from './social-publisher';
import {
  SocialPlatform,
  SourceType,
  DraftRequest,
  DraftResult,
  PLATFORM_LIMITS,
} from './platform-types';
import { logger } from '../../utils/logger';
import { requestApproval } from '../governance';

// ===========================================
// Platform-specific system prompts
// ===========================================

const PLATFORM_SYSTEM_PROMPTS: Record<SocialPlatform, string> = {
  twitter: `You are a social media copywriter specializing in Twitter/X.
Write punchy, concise posts that grab attention immediately.
Rules:
- Be direct and impactful — every word counts
- Use short sentences and strong verbs
- Lead with the most compelling hook
- Include 2-4 relevant hashtags at the end
- Emojis are encouraged but don't overdo them
- Fit within the character limit
Output format (JSON):
{
  "content": "the tweet text including hashtags",
  "hashtags": ["hashtag1", "hashtag2"],
  "estimatedEngagement": "low|medium|high"
}`,

  linkedin: `You are a professional content strategist specializing in LinkedIn.
Write thoughtful, professional posts that provide genuine value.
Rules:
- Open with an insight or question that resonates with professionals
- Use clear paragraphs with line breaks for readability
- Share concrete takeaways or lessons learned
- Include 3-5 professional hashtags at the end
- Avoid clickbait — be authentic and substantive
- Tone: warm but authoritative
Output format (JSON):
{
  "content": "the linkedin post text including hashtags",
  "hashtags": ["hashtag1", "hashtag2"],
  "estimatedEngagement": "low|medium|high"
}`,

  discord: `Du bist ein Community-Manager der für Discord-Server schreibt.
Schreibe authentische, gesprächige Nachrichten die die Community einbeziehen.
Regeln:
- Freundlicher, einladender Ton der zu Diskussionen anregt
- Nutze Discord-Markdown (bold mit **text**, Codeblöcke mit \`code\`)
- Stelle Fragen um Engagement zu fördern
- Emojis und Reaktions-Emojis sind willkommen
- Keine formellen Hashtags (Discord nutzt keine)
- Sei authentisch, nicht wie Marketing
Ausgabeformat (JSON):
{
  "content": "die Discord-Nachricht",
  "hashtags": [],
  "estimatedEngagement": "low|medium|high"
}`,
};

// ===========================================
// Content Agent Config
// ===========================================

const CONTENT_AGENT_CONFIG: AgentConfig = {
  role: 'writer',
  modelId: 'claude-sonnet-4-20250514',
  systemPrompt: PLATFORM_SYSTEM_PROMPTS.twitter, // overridden per request
  tools: [],
  temperature: 0.75,
  maxTokens: 1024,
  maxIterations: 1,
};

// ===========================================
// Default locale per platform
// ===========================================

const DEFAULT_LOCALE: Record<SocialPlatform, 'en' | 'de'> = {
  twitter: 'en',
  linkedin: 'en',
  discord: 'de',
};

// ===========================================
// Suggested posting times (next occurrence)
// ===========================================

const PLATFORM_POSTING_HOURS: Record<SocialPlatform, number> = {
  twitter: 9,   // 9 AM — peak Twitter engagement
  linkedin: 8,  // 8 AM — professionals check LinkedIn in the morning
  discord: 18,  // 6 PM — community members active in the evening
};

function getSuggestedTime(platform: SocialPlatform): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(PLATFORM_POSTING_HOURS[platform], 0, 0, 0);

  // If this hour has already passed today, schedule for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

// ===========================================
// ContentAgent class
// ===========================================

export class ContentAgent extends BaseAgent {
  /**
   * Per-call system prompt override. Set immediately before calling execute()
   * and cleared afterwards. Avoids mutating the shared config that all calls
   * would otherwise read from (concurrency-safe within a single instance as
   * draftPost is awaited sequentially; for true parallel calls each caller
   * should use a dedicated instance via createContentAgent()).
   */
  private _callSystemPrompt: string | null = null;

  constructor(configOverrides?: Partial<AgentConfig>) {
    super({ ...CONTENT_AGENT_CONFIG, ...configOverrides });
  }

  /**
   * Override BaseAgent.buildSystemPrompt to inject per-call platform prompt
   * without mutating this.config.systemPrompt.
   */
  protected override buildSystemPrompt(input: AgentInput, sharedContext: string): string {
    if (this._callSystemPrompt !== null) {
      // Temporarily swap config.systemPrompt for this build, then restore
      const original = this.config.systemPrompt;
      this.config.systemPrompt = this._callSystemPrompt;
      const result = super.buildSystemPrompt(input, sharedContext);
      this.config.systemPrompt = original;
      return result;
    }
    return super.buildSystemPrompt(input, sharedContext);
  }

  /**
   * Draft a social media post for a single platform.
   */
  async draftPost(request: DraftRequest, context: AIContext): Promise<DraftResult> {
    const { platform, sourceContent, sourceType, locale, tone, threadMode } = request;
    const limit = PLATFORM_LIMITS[platform].maxChars;

    // Build the task prompt
    const localeInstruction =
      platform === 'discord'
        ? 'Schreibe auf Deutsch.'
        : locale === 'de'
          ? 'Write in German.'
          : 'Write in English.';

    const toneInstruction =
      tone === 'technical'
        ? 'Target audience: developers and technical practitioners. Use precise technical language.'
        : tone === 'operations'
          ? 'Tone: personal and relatable — write as a founder/creator sharing their journey.'
          : 'Tone: professional yet approachable.';

    const threadInstruction = threadMode
      ? `Format as a thread — separate individual posts with "\\n---\\n". Maximum ${PLATFORM_LIMITS[platform].maxThreadPosts} posts.`
      : `Write a single post. Stay within ${limit} characters.`;

    const task = `Draft a ${platform} post based on the following ${sourceType} content.

${localeInstruction}
${toneInstruction}
${threadInstruction}

Source content:
---
${sourceContent}
---

Respond ONLY with valid JSON matching the output format in your system prompt. No extra text.`;

    // Set per-call system prompt without mutating this.config (concurrency-safe:
    // each async call sets its own prompt and clears it after execute resolves).
    this._callSystemPrompt = PLATFORM_SYSTEM_PROMPTS[platform];
    let output: Awaited<ReturnType<ContentAgent['execute']>>;
    try {
      output = await this.execute({
        task,
        aiContext: context,
        teamId: `content-agent-${platform}-${Date.now()}`,
      });
    } finally {
      this._callSystemPrompt = null;
    }

    if (!output.success || !output.content) {
      throw new Error(output.error ?? 'ContentAgent: Claude returned no content');
    }

    // Parse Claude's JSON response
    let parsed: { content: string; hashtags: string[]; estimatedEngagement: 'low' | 'medium' | 'high' };

    try {
      // Strip markdown code fences if present
      const raw = output.content.replace(/^```(?:json)?\n?/gm, '').replace(/\n?```$/gm, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: treat the whole response as content, no hashtags
      logger.warn('[ContentAgent] Failed to parse JSON response, using raw content');
      const truncated = output.content.substring(0, limit);
      parsed = {
        content: truncated,
        hashtags: [],
        estimatedEngagement: 'medium',
      };
    }

    // Enforce character limit (truncate at word boundary)
    // In thread mode, enforce the limit on each post segment individually
    const rawContent = parsed.content ?? '';
    let finalContent: string;
    if (threadMode) {
      finalContent = rawContent
        .split('\n---\n')
        .map((segment) => {
          if (segment.length > limit) {
            return segment.substring(0, limit - 3).replace(/\s+\S*$/, '') + '...';
          }
          return segment;
        })
        .join('\n---\n');
    } else {
      finalContent = rawContent;
      if (finalContent.length > limit) {
        finalContent = finalContent.substring(0, limit - 3).replace(/\s+\S*$/, '') + '...';
      }
    }

    // Normalise hashtags — strip leading # if Claude included them in array
    const hashtags = (parsed.hashtags ?? []).map((h: string) => h.replace(/^#/, ''));

    // Compute suggested time once — DB row and API response must agree
    const suggestedTime = getSuggestedTime(platform);

    // Save draft to DB
    const post = await createPostDraft(context, {
      source_type: sourceType,
      platform,
      content: finalContent,
      scheduled_at: suggestedTime,
    });

    // Request governance approval (fire-and-forget — does not block publishing flow)
    try {
      const governanceAction = await requestApproval(context, {
        action_type: 'social_publish',
        action_source: 'agent',
        description: `Post auf ${platform}: ${finalContent.slice(0, 100)}...`,
        payload: { postId: post.id, platform, content: finalContent },
        risk_level: 'medium',
      });

      // Store governance_id on the post row
      await queryContext(context, `
        UPDATE social_posts SET governance_id = $2 WHERE id = $1
      `, [post.id, governanceAction.id]);

      logger.info(`[ContentAgent] Governance approval requested for post ${post.id}`, {
        governanceId: governanceAction.id,
        status: governanceAction.status,
      });
    } catch (err) {
      // Governance is optional — log and continue
      logger.warn('[ContentAgent] Governance approval request failed (non-fatal)', {
        postId: post.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      content: finalContent,
      hashtags,
      estimatedEngagement: parsed.estimatedEngagement ?? 'medium',
      suggestedTime,
      platform,
    };
  }

  /**
   * Draft weekly summary posts for all platforms based on the past 7 days of activity.
   */
  async draftWeeklySummary(context: AIContext): Promise<DraftResult[]> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [postsResult, ideasResult, tasksResult] = await Promise.all([
      queryContext(context,
        `SELECT COUNT(*) as count FROM social_posts WHERE status = 'published' AND published_at >= $1`,
        [since],
      ),
      queryContext(context,
        `SELECT COUNT(*) as count FROM ideas WHERE created_at >= $1`,
        [since],
      ),
      queryContext(context,
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'done' AND updated_at >= $1`,
        [since],
      ),
    ]);

    const publishedPosts = parseInt(postsResult.rows[0]?.count ?? '0', 10);
    const newIdeas = parseInt(ideasResult.rows[0]?.count ?? '0', 10);
    const doneTasks = parseInt(tasksResult.rows[0]?.count ?? '0', 10);

    const weekRange = `${since.toLocaleDateString('en', { month: 'short', day: 'numeric' })}–${new Date().toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;

    const sourceContent = [
      `# Weekly Summary (${weekRange})`,
      `Published posts: ${publishedPosts}`,
      `New ideas captured: ${newIdeas}`,
      `Tasks completed: ${doneTasks}`,
    ].join('\n');

    return this.draftForAllPlatforms(sourceContent, 'proactive' as SourceType, context);
  }

  /**
   * Draft posts for all platforms (twitter, linkedin, discord) in sequence.
   */
  async draftForAllPlatforms(
    sourceContent: string,
    sourceType: SourceType,
    context: AIContext
  ): Promise<DraftResult[]> {
    const platforms: SocialPlatform[] = ['twitter', 'linkedin', 'discord'];
    const results: DraftResult[] = [];
    const errors: string[] = [];

    for (const platform of platforms) {
      const locale = DEFAULT_LOCALE[platform];

      const request: DraftRequest = {
        sourceType,
        sourceContent,
        platform,
        locale,
        tone: 'professional',
      };

      try {
        const result = await this.draftPost(request, context);
        results.push(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[ContentAgent] Failed to draft for ${platform}`, error instanceof Error ? error : undefined);
        errors.push(`${platform}: ${msg}`);
        // Continue drafting for remaining platforms
      }
    }

    if (results.length === 0 && errors.length > 0) {
      throw new Error('All platform drafts failed: ' + errors.join('; '));
    }

    return results;
  }
}

// ===========================================
// Factory function
// ===========================================

export function createContentAgent(configOverrides?: Partial<AgentConfig>): ContentAgent {
  return new ContentAgent(configOverrides);
}
