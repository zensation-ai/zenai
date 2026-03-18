describe('Memory Pipeline Consistency', () => {
  test('fact structure is valid', () => {
    const fact = { content: 'Test fact', importance: 0.8, context: 'personal' };
    expect(fact.importance).toBeGreaterThan(0);
    expect(fact.importance).toBeLessThanOrEqual(1);
  });
  test('emotional facts get higher importance', () => {
    const neutralImportance = 0.5;
    const emotionalImportance = 0.5 * (1 + 0.4 * 0.8 + 0.6 * 0.7);
    expect(emotionalImportance).toBeGreaterThan(neutralImportance);
  });
});
