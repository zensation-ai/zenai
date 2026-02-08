/**
 * Compliance & Governance Logger - Unit Tests
 */

import {
  logAIDecision,
  getDecisionLogs,
  getDecisionById,
  generateComplianceReport,
  getDataLineage,
  exportDecisionLogs,
  resetComplianceLogs,
} from '../../../services/compliance-logger';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Compliance Logger', () => {
  beforeEach(() => {
    resetComplianceLogs();
  });

  // ========================================
  // logAIDecision
  // ========================================
  describe('logAIDecision', () => {
    it('should log a decision and return an ID', () => {
      const id = logAIDecision({
        input: 'Was sind die besten KI-Strategien?',
        output: 'Hier sind 5 KI-Strategien...',
        modelId: 'claude-sonnet-4-20250514',
        confidence: 0.85,
        sources: [{ type: 'rag', description: 'RAG retrieval' }],
        context: 'personal',
        processingTimeMs: 1200,
        toolsUsed: ['web_search'],
        ragUsed: true,
        webSearchUsed: true,
      });

      expect(id).toMatch(/^dec_\d+_\d+$/);
    });

    it('should truncate long input and output', () => {
      const longInput = 'a'.repeat(2000);
      const longOutput = 'b'.repeat(5000);

      const id = logAIDecision({
        input: longInput,
        output: longOutput,
        modelId: 'claude-sonnet-4-20250514',
        confidence: 0.7,
        sources: [],
        context: 'work',
        processingTimeMs: 500,
        toolsUsed: [],
        ragUsed: false,
        webSearchUsed: false,
      });

      const decision = getDecisionById(id);
      expect(decision).toBeDefined();
      expect(decision!.input.length).toBeLessThanOrEqual(1000);
      expect(decision!.output.length).toBeLessThanOrEqual(2000);
    });

    it('should enforce size limit with FIFO eviction', () => {
      // Log many decisions
      for (let i = 0; i < 50; i++) {
        logAIDecision({
          input: `Query ${i}`,
          output: `Response ${i}`,
          modelId: 'claude-haiku-4-5-20251001',
          confidence: 0.5,
          sources: [],
          context: 'personal',
          processingTimeMs: 100,
          toolsUsed: [],
          ragUsed: false,
          webSearchUsed: false,
        });
      }

      const { total } = getDecisionLogs({ limit: 100 });
      expect(total).toBe(50);
    });
  });

  // ========================================
  // getDecisionLogs
  // ========================================
  describe('getDecisionLogs', () => {
    beforeEach(() => {
      // Create some test decisions
      logAIDecision({
        input: 'Query 1',
        output: 'Response 1',
        modelId: 'claude-sonnet-4-20250514',
        confidence: 0.9,
        sources: [{ type: 'rag', description: 'RAG' }],
        context: 'personal',
        processingTimeMs: 800,
        toolsUsed: [],
        ragUsed: true,
        webSearchUsed: false,
      });
      logAIDecision({
        input: 'Query 2',
        output: 'Response 2',
        modelId: 'claude-haiku-4-5-20251001',
        confidence: 0.6,
        sources: [{ type: 'ai_knowledge', description: 'AI' }],
        context: 'work',
        processingTimeMs: 200,
        toolsUsed: [],
        ragUsed: false,
        webSearchUsed: false,
      });
      logAIDecision({
        input: 'Query 3',
        output: 'Response 3',
        modelId: 'claude-sonnet-4-20250514',
        confidence: 0.4,
        sources: [{ type: 'web_search', description: 'Web' }],
        context: 'personal',
        processingTimeMs: 1500,
        toolsUsed: ['web_search'],
        ragUsed: false,
        webSearchUsed: true,
      });
    });

    it('should return all logs with default options', () => {
      const { logs, total } = getDecisionLogs();
      expect(total).toBe(3);
      expect(logs).toHaveLength(3);
    });

    it('should filter by context', () => {
      const { logs, total } = getDecisionLogs({ context: 'personal' });
      expect(total).toBe(2);
      expect(logs.every(l => l.context === 'personal')).toBe(true);
    });

    it('should filter by modelId', () => {
      const { logs, total } = getDecisionLogs({ modelId: 'claude-haiku-4-5-20251001' });
      expect(total).toBe(1);
      expect(logs[0].modelId).toBe('claude-haiku-4-5-20251001');
    });

    it('should filter by minConfidence', () => {
      const { logs, total } = getDecisionLogs({ minConfidence: 0.7 });
      expect(total).toBe(1);
      expect(logs[0].confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should paginate results', () => {
      const { logs: page1 } = getDecisionLogs({ limit: 2, offset: 0 });
      const { logs: page2 } = getDecisionLogs({ limit: 2, offset: 2 });
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });

    it('should sort by timestamp descending', () => {
      const { logs } = getDecisionLogs();
      for (let i = 1; i < logs.length; i++) {
        expect(logs[i - 1].timestamp).toBeGreaterThanOrEqual(logs[i].timestamp);
      }
    });
  });

  // ========================================
  // getDecisionById
  // ========================================
  describe('getDecisionById', () => {
    it('should return a decision by ID', () => {
      const id = logAIDecision({
        input: 'Test',
        output: 'Result',
        modelId: 'claude-sonnet-4-20250514',
        confidence: 0.8,
        sources: [],
        context: 'personal',
        processingTimeMs: 300,
        toolsUsed: [],
        ragUsed: false,
        webSearchUsed: false,
      });

      const decision = getDecisionById(id);
      expect(decision).toBeDefined();
      expect(decision!.id).toBe(id);
      expect(decision!.input).toBe('Test');
    });

    it('should return undefined for unknown ID', () => {
      expect(getDecisionById('dec_nonexistent')).toBeUndefined();
    });
  });

  // ========================================
  // generateComplianceReport
  // ========================================
  describe('generateComplianceReport', () => {
    beforeEach(() => {
      logAIDecision({
        input: 'Q1', output: 'R1',
        modelId: 'claude-sonnet-4-20250514', confidence: 0.9,
        sources: [{ type: 'rag', description: 'RAG' }, { type: 'memory', description: 'Memory' }],
        context: 'personal', processingTimeMs: 800,
        toolsUsed: [], ragUsed: true, webSearchUsed: false,
      });
      logAIDecision({
        input: 'Q2', output: 'R2',
        modelId: 'claude-haiku-4-5-20251001', confidence: 0.7,
        sources: [{ type: 'ai_knowledge', description: 'AI' }],
        context: 'work', processingTimeMs: 200,
        toolsUsed: ['web_search'], ragUsed: false, webSearchUsed: true,
      });
      logAIDecision({
        input: 'Q3', output: 'R3',
        modelId: 'claude-sonnet-4-20250514', confidence: 0.85,
        sources: [{ type: 'rag', description: 'RAG' }],
        context: 'personal', processingTimeMs: 600,
        toolsUsed: [], ragUsed: true, webSearchUsed: false,
      });
    });

    it('should generate a complete report', () => {
      const report = generateComplianceReport(30);

      expect(report.generatedAt).toBeGreaterThan(0);
      expect(report.period.start).toBeLessThan(report.period.end);
      expect(report.decisions).toHaveLength(3);
      expect(report.summary.totalDecisions).toBe(3);
    });

    it('should calculate correct summary statistics', () => {
      const report = generateComplianceReport(30);
      const { summary } = report;

      expect(summary.totalDecisions).toBe(3);
      expect(summary.averageConfidence).toBeCloseTo(0.82, 1);
      expect(summary.ragUsageRate).toBeCloseTo(0.67, 1);
      expect(summary.webSearchUsageRate).toBeCloseTo(0.33, 1);
      expect(summary.uniqueModelsUsed).toBe(2);
      expect(summary.averageProcessingTimeMs).toBeGreaterThan(0);
    });

    it('should provide source breakdown', () => {
      const report = generateComplianceReport(30);

      expect(report.sourceBreakdown['rag']).toBe(2);
      expect(report.sourceBreakdown['memory']).toBe(1);
      expect(report.sourceBreakdown['ai_knowledge']).toBe(1);
    });

    it('should provide model breakdown', () => {
      const report = generateComplianceReport(30);

      expect(report.modelBreakdown['claude-sonnet-4-20250514'].count).toBe(2);
      expect(report.modelBreakdown['claude-haiku-4-5-20251001'].count).toBe(1);
      expect(report.modelBreakdown['claude-sonnet-4-20250514'].avgConfidence).toBeCloseTo(0.875, 2);
    });

    it('should filter by context', () => {
      const report = generateComplianceReport(30, 'personal');
      expect(report.summary.totalDecisions).toBe(2);
      expect(report.decisions.every(d => d.context === 'personal')).toBe(true);
    });

    it('should handle empty period', () => {
      resetComplianceLogs();
      const report = generateComplianceReport(30);

      expect(report.summary.totalDecisions).toBe(0);
      expect(report.summary.averageConfidence).toBe(0);
      expect(report.summary.ragUsageRate).toBe(0);
      expect(report.decisions).toHaveLength(0);
    });
  });

  // ========================================
  // getDataLineage
  // ========================================
  describe('getDataLineage', () => {
    it('should return data lineage for a decision', () => {
      const id = logAIDecision({
        input: 'Test lineage',
        output: 'Result',
        modelId: 'claude-sonnet-4-20250514',
        confidence: 0.8,
        sources: [
          { type: 'rag', description: 'RAG results', itemIds: ['idea_1', 'idea_2'], relevance: 0.9 },
          { type: 'memory', description: 'Long-term memory', relevance: 0.7 },
          { type: 'web_search', description: 'Brave search', relevance: 0.6 },
        ],
        context: 'personal',
        processingTimeMs: 1000,
        toolsUsed: ['web_search'],
        ragUsed: true,
        webSearchUsed: true,
      });

      const lineage = getDataLineage(id);
      expect(lineage.decision).toBeDefined();
      expect(lineage.sources).toHaveLength(3);
      expect(lineage.sourceTypes).toContain('rag');
      expect(lineage.sourceTypes).toContain('memory');
      expect(lineage.sourceTypes).toContain('web_search');
    });

    it('should return empty for unknown decision', () => {
      const lineage = getDataLineage('dec_nonexistent');
      expect(lineage.decision).toBeUndefined();
      expect(lineage.sources).toHaveLength(0);
      expect(lineage.sourceTypes).toHaveLength(0);
    });
  });

  // ========================================
  // exportDecisionLogs
  // ========================================
  describe('exportDecisionLogs', () => {
    it('should export as CSV', () => {
      logAIDecision({
        input: 'Test export',
        output: 'Export result',
        modelId: 'claude-sonnet-4-20250514',
        confidence: 0.8,
        sources: [{ type: 'rag', description: 'RAG' }],
        context: 'personal',
        processingTimeMs: 500,
        toolsUsed: [],
        ragUsed: true,
        webSearchUsed: false,
      });

      const csv = exportDecisionLogs(30);
      const lines = csv.split('\n');

      expect(lines[0]).toBe('ID,Timestamp,Input,Output,Model,Confidence,Sources,RAG,WebSearch,ProcessingMs,Context');
      expect(lines).toHaveLength(2); // header + 1 row
      expect(lines[1]).toContain('claude-sonnet-4-20250514');
      expect(lines[1]).toContain('"personal"');
    });

    it('should handle quotes in content', () => {
      logAIDecision({
        input: 'What is "AI"?',
        output: 'AI means "Artificial Intelligence"',
        modelId: 'claude-sonnet-4-20250514',
        confidence: 0.9,
        sources: [],
        context: 'personal',
        processingTimeMs: 300,
        toolsUsed: [],
        ragUsed: false,
        webSearchUsed: false,
      });

      const csv = exportDecisionLogs(30);
      // Quotes should be escaped as ""
      expect(csv).toContain('""AI""');
    });

    it('should return only header when no logs', () => {
      const csv = exportDecisionLogs(30);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('ID,Timestamp');
    });
  });

  // ========================================
  // resetComplianceLogs
  // ========================================
  describe('resetComplianceLogs', () => {
    it('should clear all logs', () => {
      logAIDecision({
        input: 'Test', output: 'Result',
        modelId: 'test', confidence: 0.5,
        sources: [], context: 'personal',
        processingTimeMs: 100, toolsUsed: [],
        ragUsed: false, webSearchUsed: false,
      });

      expect(getDecisionLogs().total).toBe(1);

      resetComplianceLogs();

      expect(getDecisionLogs().total).toBe(0);
    });
  });
});
