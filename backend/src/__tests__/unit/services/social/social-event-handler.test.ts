/**
 * Unit tests for social-event-handler
 *
 * Verifies that:
 * - blog_published events trigger ContentAgent.draftForAllPlatforms
 * - phase_completed events trigger ContentAgent.draftForAllPlatforms
 * - Events with missing content are skipped gracefully
 * - Errors in ContentAgent don't propagate (fire-and-forget)
 * - Handlers are only registered once (idempotent)
 *
 * @module __tests__/unit/services/social/social-event-handler
 */

// ===========================================
// Mocks
// ===========================================

const mockDraftForAllPlatforms = jest.fn().mockResolvedValue([
  { platform: 'twitter', content: 'test', hashtags: [], estimatedEngagement: 'medium', suggestedTime: new Date() },
  { platform: 'linkedin', content: 'test', hashtags: [], estimatedEngagement: 'medium', suggestedTime: new Date() },
  { platform: 'discord', content: 'test', hashtags: [], estimatedEngagement: 'medium', suggestedTime: new Date() },
]);

jest.mock('../../../../services/social/content-agent', () => ({
  createContentAgent: jest.fn(() => ({
    draftForAllPlatforms: mockDraftForAllPlatforms,
  })),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Capture subscribed handlers
const subscriptions = new Map<string, Function[]>();

jest.mock('../../../../services/plugins/event-bus', () => ({
  subscribe: jest.fn((eventType: string, handler: Function) => {
    if (!subscriptions.has(eventType)) {
      subscriptions.set(eventType, []);
    }
    subscriptions.get(eventType)!.push(handler);
    return () => {};
  }),
}));

// ===========================================
// Imports
// ===========================================

import { registerSocialEventHandlers } from '../../../../services/social/social-event-handler';
import { createContentAgent } from '../../../../services/social/content-agent';
import { logger } from '../../../../utils/logger';
import type { PluginEvent } from '../../../../services/plugins/plugin-types';

// ===========================================
// Helpers
// ===========================================

function createEvent(type: string, data: Record<string, unknown>, context = 'finance'): PluginEvent {
  return {
    type,
    source: 'test',
    data,
    timestamp: new Date().toISOString(),
    context,
  };
}

async function triggerEvent(type: string, data: Record<string, unknown>, context = 'finance'): Promise<void> {
  const handlers = subscriptions.get(type) || [];
  for (const handler of handlers) {
    await handler(createEvent(type, data, context));
  }
}

// ===========================================
// Tests
// ===========================================

describe('social-event-handler', () => {
  beforeAll(() => {
    // Reset the module-level _registered flag by clearing module cache
    subscriptions.clear();
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../../../../services/social/social-event-handler');
      mod.registerSocialEventHandlers();
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registration', () => {
    it('should subscribe to blog_published and phase_completed', () => {
      expect(subscriptions.has('blog_published')).toBe(true);
      expect(subscriptions.has('phase_completed')).toBe(true);
    });

    it('should register exactly one handler per event type', () => {
      expect(subscriptions.get('blog_published')?.length).toBe(1);
      expect(subscriptions.get('phase_completed')?.length).toBe(1);
    });
  });

  describe('blog_published handler', () => {
    it('should call draftForAllPlatforms with blog source type', async () => {
      await triggerEvent('blog_published', {
        title: 'Launching ZenBrain',
        slug: 'launching-zenbrain',
        content: 'We are excited to announce ZenBrain...',
        url: 'https://zensation.ai/blog/launching-zenbrain',
      });

      expect(createContentAgent).toHaveBeenCalled();
      expect(mockDraftForAllPlatforms).toHaveBeenCalledWith(
        expect.stringContaining('Launching ZenBrain'),
        'blog',
        'finance',
      );
    });

    it('should use excerpt when available', async () => {
      await triggerEvent('blog_published', {
        title: 'Test Post',
        slug: 'test',
        excerpt: 'Short summary of the post',
        content: 'Full content that is much longer...',
      });

      expect(mockDraftForAllPlatforms).toHaveBeenCalledWith(
        expect.stringContaining('Short summary of the post'),
        'blog',
        'finance',
      );
    });

    it('should skip events without content or excerpt', async () => {
      await triggerEvent('blog_published', {
        title: 'No Content',
        slug: 'no-content',
      });

      expect(mockDraftForAllPlatforms).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('missing content/excerpt'),
        expect.objectContaining({ slug: 'no-content' }),
      );
    });

    it('should use provided context from event', async () => {
      await triggerEvent('blog_published', {
        title: 'Creative Post',
        content: 'Some creative content',
      }, 'strategy');

      expect(mockDraftForAllPlatforms).toHaveBeenCalledWith(
        expect.any(String),
        'blog',
        'strategy',
      );
    });

    it('should not throw when ContentAgent fails', async () => {
      mockDraftForAllPlatforms.mockRejectedValueOnce(new Error('API down'));

      // Should not throw
      await triggerEvent('blog_published', {
        title: 'Failing Post',
        content: 'This will fail',
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to draft blog posts'),
        expect.any(Error),
        expect.objectContaining({ context: 'finance' }),
      );
    });
  });

  describe('phase_completed handler', () => {
    it('should call draftForAllPlatforms with changelog source type', async () => {
      await triggerEvent('phase_completed', {
        phase: 143,
        title: 'Social Media Agent',
        highlights: ['ContentAgent', 'BullMQ scheduler', 'Governance integration'],
      });

      expect(createContentAgent).toHaveBeenCalled();
      expect(mockDraftForAllPlatforms).toHaveBeenCalledWith(
        expect.stringContaining('Phase 143'),
        'changelog',
        'finance',
      );
    });

    it('should include highlights in source content', async () => {
      await triggerEvent('phase_completed', {
        phase: 100,
        highlights: ['Feature A', 'Feature B'],
      });

      const sourceContent = mockDraftForAllPlatforms.mock.calls[0][0] as string;
      expect(sourceContent).toContain('Feature A');
      expect(sourceContent).toContain('Feature B');
    });

    it('should handle phase events with changelog text', async () => {
      await triggerEvent('phase_completed', {
        phase: 99,
        changelog: 'Detailed changelog text here...',
      });

      const sourceContent = mockDraftForAllPlatforms.mock.calls[0][0] as string;
      expect(sourceContent).toContain('Detailed changelog text here');
    });

    it('should handle phase events with minimal data', async () => {
      await triggerEvent('phase_completed', {
        phase: 50,
      });

      expect(mockDraftForAllPlatforms).toHaveBeenCalledWith(
        expect.stringContaining('Phase 50'),
        'changelog',
        'finance',
      );
    });

    it('should not throw when ContentAgent fails', async () => {
      mockDraftForAllPlatforms.mockRejectedValueOnce(new Error('Claude timeout'));

      await triggerEvent('phase_completed', {
        phase: 42,
        title: 'Failing Phase',
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to draft phase completion posts'),
        expect.any(Error),
        expect.objectContaining({ context: 'finance' }),
      );
    });
  });
});
