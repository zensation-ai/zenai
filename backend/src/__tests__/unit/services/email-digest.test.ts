/**
 * Email Digest Service Tests - Phase 43
 */

import { formatDigestForChat } from '../../../services/email-digest';

describe('Email Digest Service', () => {
  describe('formatDigestForChat', () => {
    it('should format daily digest', () => {
      const result = formatDigestForChat({
        period: 'daily',
        context: 'work',
        generated_at: '2026-03-09T08:00:00Z',
        stats: {
          total_received: 12,
          total_sent: 5,
          unread: 3,
          by_category: { business: 8, personal: 4 },
          by_priority: { high: 2, medium: 10 },
        },
        highlights: [{
          email_id: '1',
          subject: 'Urgent Project Update',
          from: 'Boss',
          priority: 'urgent',
          summary: 'Deadline moved up',
        }],
        action_items: [{
          email_id: '2',
          subject: 'Meeting Notes',
          items: [{ text: 'Prepare presentation' }],
        }],
        ai_narrative: 'Heute sind 12 E-Mails eingegangen, davon 2 mit hoher Priorität.',
      });

      expect(result).toContain('Tageszusammenfassung');
      expect(result).toContain('12 empfangen');
      expect(result).toContain('5 gesendet');
      expect(result).toContain('3 ungelesen');
      expect(result).toContain('Urgent Project Update');
      expect(result).toContain('Boss');
      expect(result).toContain('🔴');
      expect(result).toContain('Prepare presentation');
      expect(result).toContain('12 E-Mails eingegangen');
    });

    it('should format weekly digest', () => {
      const result = formatDigestForChat({
        period: 'weekly',
        context: 'personal',
        generated_at: '2026-03-09T08:00:00Z',
        stats: {
          total_received: 45,
          total_sent: 20,
          unread: 0,
          by_category: {},
          by_priority: {},
        },
        highlights: [],
        action_items: [],
        ai_narrative: 'Ruhige Woche.',
      });

      expect(result).toContain('Wochenzusammenfassung');
      expect(result).toContain('45 empfangen');
      expect(result).not.toContain('Wichtige E-Mails');
    });

    it('should handle empty digest gracefully', () => {
      const result = formatDigestForChat({
        period: 'daily',
        context: 'work',
        generated_at: '2026-03-09T08:00:00Z',
        stats: {
          total_received: 0,
          total_sent: 0,
          unread: 0,
          by_category: {},
          by_priority: {},
        },
        highlights: [],
        action_items: [],
        ai_narrative: 'Keine E-Mails heute.',
      });

      expect(result).toContain('0 empfangen');
      expect(result).toContain('Keine E-Mails heute');
    });

    it('should show high priority with orange emoji', () => {
      const result = formatDigestForChat({
        period: 'daily',
        context: 'work',
        generated_at: '2026-03-09T08:00:00Z',
        stats: {
          total_received: 1,
          total_sent: 0,
          unread: 1,
          by_category: {},
          by_priority: {},
        },
        highlights: [{
          email_id: '1',
          subject: 'Important',
          from: 'Someone',
          priority: 'high',
          summary: 'Review needed',
        }],
        action_items: [],
        ai_narrative: 'Eine wichtige E-Mail.',
      });

      expect(result).toContain('🟠');
      expect(result).toContain('Important');
      expect(result).toContain('Review needed');
    });
  });
});
