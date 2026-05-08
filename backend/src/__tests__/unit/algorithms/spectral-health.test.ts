import {
  computeLaplacian,
  computeFiedlerValue,
  computeSpectralHealth,
  SpectralReport,
} from '../../../algorithms/spectral-health';

describe('Spectral KG Health Monitor', () => {
  // Simple triangle graph: 3 nodes, 3 edges
  const triangleAdj = [
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ];

  // Disconnected graph: 2 components
  const disconnectedAdj = [
    [0, 1, 0, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 1],
    [0, 0, 1, 0],
  ];

  describe('computeLaplacian', () => {
    it('should produce L = D - A', () => {
      const L = computeLaplacian(triangleAdj);
      // Diagonal = degree (2 for each node in triangle)
      expect(L[0][0]).toBe(2);
      expect(L[1][1]).toBe(2);
      // Off-diagonal = -adjacency
      expect(L[0][1]).toBe(-1);
    });

    it('should have row sums of zero', () => {
      const L = computeLaplacian(triangleAdj);
      for (const row of L) {
        const sum = row.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(0);
      }
    });
  });

  describe('computeFiedlerValue', () => {
    it('should be positive for connected graph', () => {
      const lambda2 = computeFiedlerValue(triangleAdj);
      expect(lambda2).toBeGreaterThan(0);
    });

    it('should be zero for disconnected graph', () => {
      const lambda2 = computeFiedlerValue(disconnectedAdj);
      expect(lambda2).toBeCloseTo(0, 5);
    });

    it('should be exactly 3 for complete triangle (K3)', () => {
      // For K_n, lambda_2 = n. For K_3, lambda_2 = 3.
      const lambda2 = computeFiedlerValue(triangleAdj);
      expect(lambda2).toBeCloseTo(3, 1);
    });
  });

  describe('computeSpectralHealth', () => {
    it('should detect fragmentation when lambda2 drops', () => {
      const report = computeSpectralHealth(disconnectedAdj, 0.5);
      expect(report.isFragmented).toBe(true);
      expect(report.consolidationSuccessful).toBe(false);
    });

    it('should report healthy connected graph', () => {
      const report = computeSpectralHealth(triangleAdj, 2.0);
      expect(report.isFragmented).toBe(false);
      expect(report.fiedlerValue).toBeGreaterThan(0);
    });
  });
});
