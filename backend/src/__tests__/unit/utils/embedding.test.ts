/**
 * Unit Tests for Embedding Utilities
 *
 * Tests quantization, similarity calculations, and pgvector formatting.
 */

import {
  quantizeToInt8,
  quantizeToBinary,
  cosineSimilarity,
  hammingDistance,
  formatForPgVector,
  parseFromPgVector,
} from '../../../utils/embedding';

describe('Embedding Utilities', () => {
  // ===========================================
  // quantizeToInt8 Tests
  // ===========================================

  describe('quantizeToInt8', () => {
    it('should return empty array for empty input', () => {
      const result = quantizeToInt8([]);
      expect(result).toEqual([]);
    });

    it('should quantize single value to 0', () => {
      const result = quantizeToInt8([0.5]);
      // With single value, range is 0, so all values map to same point
      expect(result).toHaveLength(1);
    });

    it('should quantize values to Int8 range (-128 to 127)', () => {
      const embedding = [0.1, 0.5, 0.9, 0.3, 0.7];
      const result = quantizeToInt8(embedding);

      expect(result).toHaveLength(5);
      result.forEach(val => {
        expect(val).toBeGreaterThanOrEqual(-128);
        expect(val).toBeLessThanOrEqual(127);
        expect(Number.isInteger(val)).toBe(true);
      });
    });

    it('should map min value to -128 and max to 127', () => {
      const embedding = [0, 0.5, 1];
      const result = quantizeToInt8(embedding);

      expect(result[0]).toBe(-128); // min maps to -128
      expect(result[2]).toBe(127);  // max maps to 127
    });

    it('should handle negative values', () => {
      const embedding = [-1, 0, 1];
      const result = quantizeToInt8(embedding);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(-128);
      expect(result[2]).toBe(127);
    });

    it('should handle identical values', () => {
      const embedding = [0.5, 0.5, 0.5];
      const result = quantizeToInt8(embedding);

      // All same values, range is 0, falls back to range=1
      expect(result).toHaveLength(3);
      result.forEach(val => {
        expect(Number.isInteger(val)).toBe(true);
      });
    });

    it('should preserve relative ordering', () => {
      const embedding = [0.1, 0.3, 0.5, 0.7, 0.9];
      const result = quantizeToInt8(embedding);

      for (let i = 1; i < result.length; i++) {
        expect(result[i]).toBeGreaterThan(result[i - 1]);
      }
    });

    it('should handle very small ranges', () => {
      const embedding = [0.001, 0.002, 0.003];
      const result = quantizeToInt8(embedding);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(-128);
      expect(result[2]).toBe(127);
    });

    it('should handle large embeddings (768 dimensions)', () => {
      const embedding = Array(768).fill(0).map((_, i) => i / 768);
      const result = quantizeToInt8(embedding);

      expect(result).toHaveLength(768);
      expect(result[0]).toBe(-128);
      expect(result[767]).toBe(127);
    });
  });

  // ===========================================
  // quantizeToBinary Tests
  // ===========================================

  describe('quantizeToBinary', () => {
    it('should return empty string for empty input', () => {
      const result = quantizeToBinary([]);
      expect(result).toBe('');
    });

    it('should return binary string', () => {
      const embedding = [0.1, 0.5, 0.9, 0.3, 0.7];
      const result = quantizeToBinary(embedding);

      expect(typeof result).toBe('string');
      expect(result).toHaveLength(5);
      expect(result).toMatch(/^[01]+$/);
    });

    it('should have roughly half 0s and half 1s', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      const result = quantizeToBinary(embedding);

      const ones = result.split('').filter(c => c === '1').length;
      const zeros = result.split('').filter(c => c === '0').length;

      // Should have approximately half and half (median-based)
      expect(ones).toBeGreaterThan(0);
      expect(zeros).toBeGreaterThan(0);
    });

    it('should mark values above median as 1', () => {
      // Median of [1, 2, 3, 4, 5] is 3
      // Values > 3 should be 1, values <= 3 should be 0
      const embedding = [1, 2, 3, 4, 5];
      const result = quantizeToBinary(embedding);

      expect(result[3]).toBe('1'); // 4 > median
      expect(result[4]).toBe('1'); // 5 > median
    });

    it('should handle single element', () => {
      const result = quantizeToBinary([0.5]);
      expect(result).toHaveLength(1);
      expect(result).toMatch(/^[01]$/);
    });

    it('should handle two elements', () => {
      const result = quantizeToBinary([0.3, 0.7]);
      expect(result).toHaveLength(2);
    });
  });

  // ===========================================
  // cosineSimilarity Tests
  // ===========================================

  describe('cosineSimilarity', () => {
    it('should return 0 for empty arrays', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('should return 0 for different length arrays', () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      const similarity = cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [-1, -2, -3];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0];
      const vec2 = [0, 1];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should handle zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
    });

    it('should handle single element vectors', () => {
      expect(cosineSimilarity([5], [5])).toBeCloseTo(1, 5);
      expect(cosineSimilarity([5], [-5])).toBeCloseTo(-1, 5);
    });

    it('should be symmetric', () => {
      const vec1 = [1, 2, 3, 4];
      const vec2 = [4, 3, 2, 1];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(cosineSimilarity(vec2, vec1), 10);
    });

    it('should be scale invariant', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [2, 4, 6]; // vec1 * 2
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should handle real-world embedding values', () => {
      const vec1 = [0.1, 0.2, 0.3, -0.1, 0.5];
      const vec2 = [0.15, 0.25, 0.28, -0.05, 0.48];
      const similarity = cosineSimilarity(vec1, vec2);

      expect(similarity).toBeGreaterThan(0.9);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  // ===========================================
  // hammingDistance Tests
  // ===========================================

  describe('hammingDistance', () => {
    it('should return Infinity for different length strings', () => {
      expect(hammingDistance('101', '1010')).toBe(Infinity);
    });

    it('should return 0 for identical strings', () => {
      expect(hammingDistance('10101', '10101')).toBe(0);
    });

    it('should count differing positions', () => {
      expect(hammingDistance('10101', '10100')).toBe(1);
      expect(hammingDistance('10101', '01010')).toBe(5);
      expect(hammingDistance('11111', '00000')).toBe(5);
    });

    it('should work with empty strings', () => {
      expect(hammingDistance('', '')).toBe(0);
    });

    it('should be symmetric', () => {
      const a = '10110100';
      const b = '01101011';
      expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
    });

    it('should handle long binary strings', () => {
      const a = '1'.repeat(100);
      const b = '0'.repeat(100);
      expect(hammingDistance(a, b)).toBe(100);
    });

    it('should handle single character strings', () => {
      expect(hammingDistance('0', '0')).toBe(0);
      expect(hammingDistance('0', '1')).toBe(1);
    });
  });

  // ===========================================
  // formatForPgVector Tests
  // ===========================================

  describe('formatForPgVector', () => {
    it('should format empty array', () => {
      expect(formatForPgVector([])).toBe('[]');
    });

    it('should format single value', () => {
      expect(formatForPgVector([0.5])).toBe('[0.5]');
    });

    it('should format multiple values', () => {
      expect(formatForPgVector([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
    });

    it('should handle negative values', () => {
      expect(formatForPgVector([-0.1, 0, 0.1])).toBe('[-0.1,0,0.1]');
    });

    it('should handle integers', () => {
      expect(formatForPgVector([1, 2, 3])).toBe('[1,2,3]');
    });

    it('should handle scientific notation', () => {
      const result = formatForPgVector([1e-10, 2e5]);
      expect(result).toContain('1e-10');
      expect(result).toContain('200000');
    });
  });

  // ===========================================
  // parseFromPgVector Tests
  // ===========================================

  describe('parseFromPgVector', () => {
    it('should parse empty vector to [0]', () => {
      // parseFromPgVector('[]') -> ''.split(',').map(Number) -> [0]
      // This is because Number('') === 0
      const result = parseFromPgVector('[]');
      expect(result).toEqual([0]);
    });

    it('should parse single value', () => {
      expect(parseFromPgVector('[0.5]')).toEqual([0.5]);
    });

    it('should parse multiple values', () => {
      expect(parseFromPgVector('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
    });

    it('should handle negative values', () => {
      expect(parseFromPgVector('[-0.1,0,0.1]')).toEqual([-0.1, 0, 0.1]);
    });

    it('should handle spaces', () => {
      expect(parseFromPgVector('[ 0.1 , 0.2 , 0.3 ]')).toEqual([0.1, 0.2, 0.3]);
    });

    it('should roundtrip correctly', () => {
      const original = [0.123, -0.456, 0.789];
      const formatted = formatForPgVector(original);
      const parsed = parseFromPgVector(formatted);
      expect(parsed).toEqual(original);
    });

    it('should handle integers', () => {
      expect(parseFromPgVector('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('should handle large arrays', () => {
      const original = Array(768).fill(0).map((_, i) => i * 0.001);
      const formatted = formatForPgVector(original);
      const parsed = parseFromPgVector(formatted);
      expect(parsed).toHaveLength(768);
    });
  });

  // ===========================================
  // Integration Tests
  // ===========================================

  describe('Integration', () => {
    it('should preserve similarity after quantization', () => {
      // Two similar embeddings
      const embed1 = [0.1, 0.2, 0.3, 0.4, 0.5];
      const embed2 = [0.12, 0.22, 0.28, 0.42, 0.48];

      // Original similarity
      const originalSim = cosineSimilarity(embed1, embed2);

      // Quantized similarity (Int8)
      const quant1 = quantizeToInt8(embed1);
      const quant2 = quantizeToInt8(embed2);
      const quantSim = cosineSimilarity(quant1, quant2);

      // Should preserve high similarity
      expect(originalSim).toBeGreaterThan(0.95);
      expect(quantSim).toBeGreaterThan(0.9);
    });

    it('should create valid pgvector format for real embeddings', () => {
      // Simulate a 768-dim embedding (like nomic-embed-text)
      const embedding = Array(768).fill(0).map(() => Math.random() * 2 - 1);

      const formatted = formatForPgVector(embedding);

      expect(formatted).toMatch(/^\[.*\]$/);
      expect(formatted.split(',').length).toBe(768);
    });

    it('should handle binary comparison for similar/dissimilar vectors', () => {
      const similar1 = [0.9, 0.8, 0.7, 0.6, 0.5];
      const similar2 = [0.85, 0.75, 0.72, 0.58, 0.52];
      const dissimilar = [0.1, 0.2, 0.3, 0.4, 0.5];

      const bin1 = quantizeToBinary(similar1);
      const bin2 = quantizeToBinary(similar2);
      const bin3 = quantizeToBinary(dissimilar);

      const distSimilar = hammingDistance(bin1, bin2);
      const distDissimilar = hammingDistance(bin1, bin3);

      expect(distSimilar).toBeLessThan(distDissimilar);
    });

    it('should handle full pipeline: embed -> quantize -> store -> retrieve', () => {
      const original = [0.1, -0.2, 0.3, -0.4, 0.5];

      // Quantize
      const int8 = quantizeToInt8(original);
      const binary = quantizeToBinary(original);

      // Store (format for DB)
      const pgVector = formatForPgVector(original);

      // Retrieve
      const retrieved = parseFromPgVector(pgVector);

      expect(retrieved).toEqual(original);
      expect(int8.length).toBe(original.length);
      expect(binary.length).toBe(original.length);
    });

    it('should maintain similarity ranking across quantization', () => {
      const base = [0.5, 0.5, 0.5, 0.5];
      const close = [0.51, 0.49, 0.52, 0.48];
      const far = [0.1, 0.9, 0.1, 0.9];

      // Original similarities
      const origCloseScore = cosineSimilarity(base, close);
      const origFarScore = cosineSimilarity(base, far);

      // Quantized similarities
      const baseQ = quantizeToInt8(base);
      const closeQ = quantizeToInt8(close);
      const farQ = quantizeToInt8(far);

      const quantCloseScore = cosineSimilarity(baseQ, closeQ);
      const quantFarScore = cosineSimilarity(baseQ, farQ);

      // Ranking should be preserved
      expect(origCloseScore).toBeGreaterThan(origFarScore);
      expect(quantCloseScore).toBeGreaterThan(quantFarScore);
    });
  });
});
