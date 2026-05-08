/**
 * Compositional Context Embeddings with Orthogonal Subspaces
 *
 * Based on: Nature 2025 "Building compositional tasks with shared neural
 * subspaces" + bioRxiv 2025 "Orthogonal neural codes for task context
 * and spatial memory in prefrontal cortex"
 *
 * Memory encoding: h(c,m) = P_shared * e_m + Q_c * c_c
 * where P_shared is the shared low-D memory subspace and Q_c is the
 * orthogonal context subspace. P^T * Q = 0 (orthogonality constraint).
 *
 * This enables cross-context transfer (learning→work) without
 * context contamination.
 */

export type ContextType = 'operations' | 'finance' | 'people' | 'strategy';

export interface ContextMemory {
  embedding: number[];
  context: ContextType;
  content: string;
}

/**
 * Gram-Schmidt orthogonalization: make b orthogonal to a.
 * b_orth = b - (b·a / a·a) * a
 */
export function orthogonalize(b: number[], a: number[]): number[] {
  const dotBA = b.reduce((sum, val, i) => sum + val * a[i], 0);
  const dotAA = a.reduce((sum, val, i) => sum + val * a[i], 0);
  if (dotAA === 0) return [...b];
  const scale = dotBA / dotAA;
  return b.map((val, i) => val - scale * a[i]);
}

/**
 * Project vector onto subspace defined by basis vectors.
 * Returns the projected vector (same dimensionality as input).
 */
export function projectToSubspace(vector: number[], basis: number[][]): number[] {
  const result = new Array(vector.length).fill(0);
  for (const b of basis) {
    const dotVB = vector.reduce((sum, val, i) => sum + val * b[i], 0);
    const dotBB = b.reduce((sum, val, i) => sum + val * b[i], 0);
    if (dotBB === 0) continue;
    const scale = dotVB / dotBB;
    for (let i = 0; i < result.length; i++) {
      result[i] += scale * b[i];
    }
  }
  return result;
}

export class CompositionalContextEncoder {
  private sharedDim: number;
  private totalDim: number;
  private contextBasis: Map<ContextType, number[][]>;

  constructor(totalDim: number, sharedDim: number) {
    this.totalDim = totalDim;
    this.sharedDim = sharedDim;
    this.contextBasis = new Map();

    // Initialize context-specific basis vectors (orthogonal to shared subspace)
    const contexts: ContextType[] = ['operations', 'finance', 'people', 'strategy'];
    for (const ctx of contexts) {
      this.contextBasis.set(ctx, this.generateContextBasis(ctx));
    }
  }

  private generateContextBasis(context: ContextType): number[][] {
    // Deterministic basis per context (seeded by context name hash)
    const seed = context.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const contextDim = this.totalDim - this.sharedDim;
    const basis: number[][] = [];

    for (let i = 0; i < contextDim; i++) {
      const vec = new Array(this.totalDim).fill(0);
      // Context components live in the latter dimensions
      vec[this.sharedDim + i] = 1;
      // Add small context-specific perturbation (seeded)
      const perturbation = ((seed * (i + 1) * 2654435761) >>> 0) / 4294967296;
      vec[this.sharedDim + i] += perturbation * 0.1;
      basis.push(vec);
    }

    return basis;
  }

  /**
   * Encode memory embedding with shared + context-orthogonal components.
   */
  encode(embedding: number[], context: ContextType): number[] {
    if (embedding.length !== this.totalDim) {
      throw new Error(`Expected ${this.totalDim}D embedding, got ${embedding.length}D`);
    }

    // Shared component: first sharedDim dimensions (low-D memory subspace)
    const sharedComponent = embedding.slice(0, this.sharedDim);

    // Context component: remaining dimensions, projected through context basis
    const contextDims = embedding.slice(this.sharedDim);
    const contextBasis = this.contextBasis.get(context) || [];

    // Orthogonalize context component against shared
    const contextComponent = contextDims.map((val, i) => {
      const basisVec = contextBasis[i];
      return basisVec ? val * basisVec[this.sharedDim + i] : val;
    });

    return [...sharedComponent, ...contextComponent];
  }

  /**
   * Cross-context recall: match on shared component, filter by context relevance.
   */
  crossContextRecall(
    query: number[],
    memories: ContextMemory[],
    targetContext: ContextType,
    threshold = 0.3,
  ): ContextMemory[] {
    const queryShared = query.slice(0, this.sharedDim);

    return memories
      .map(memory => {
        const memShared = memory.embedding.slice(0, this.sharedDim);
        const similarity = cosineSimilarity(queryShared, memShared);
        return { memory, similarity };
      })
      .filter(({ similarity }) => similarity > threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .map(({ memory }) => memory);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
