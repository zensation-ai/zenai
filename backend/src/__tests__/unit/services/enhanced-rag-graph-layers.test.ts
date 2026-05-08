import { applyEventActivityBoost } from '../../../services/enhanced-rag';

jest.mock('../../../services/knowledge-graph/graph-layers', () => ({
  queryAcrossLayers: jest.fn().mockResolvedValue([
    { entityId: 'idea-1', eventScore: 0.8, combinedScore: 0.6 },
    { entityId: 'idea-2', eventScore: 0.2, combinedScore: 0.15 },
  ]),
}));

describe('Event Activity Boost in Enhanced RAG', () => {
  it('boosts scores for recently active entities', async () => {
    const results = [
      { id: 'idea-1', content: 'Active idea', score: 0.7, source: 'hyde' as const },
      { id: 'idea-2', content: 'Inactive idea', score: 0.7, source: 'agentic' as const },
      { id: 'idea-3', content: 'Unknown idea', score: 0.7, source: 'hyde' as const },
    ];
    const boosted = await applyEventActivityBoost('operations', results);
    expect(boosted[0].id).toBe('idea-1');
    expect(boosted[0].score).toBeGreaterThan(0.7);
    const idea3 = boosted.find(r => r.id === 'idea-3');
    expect(idea3?.score).toBe(0.7);
  });

  it('returns empty array for empty input', async () => {
    const boosted = await applyEventActivityBoost('operations', []);
    expect(boosted).toEqual([]);
  });

  it('caps boosted scores at 1.0', async () => {
    const results = [
      { id: 'idea-1', content: 'High score idea', score: 0.95, source: 'hyde' as const },
    ];
    const boosted = await applyEventActivityBoost('operations', results);
    expect(boosted[0].score).toBeLessThanOrEqual(1.0);
  });
});
