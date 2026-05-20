import { CachedEmployee } from './storage';

export interface MatchResult {
  employee: CachedEmployee | null;
  distance: number;
  confidence: number;
}

export const faceMatcherService = {
  /**
   * Calculate Cosine Similarity between two UNIT VECTOR arrays.
   * For L2-normalized embeddings: cosine_sim = 1 - (L2_dist^2 / 2)
   * Returns a value between 0.0 (no match) and 1.0 (perfect match).
   */
  cosineSimilarity(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length !== v2.length || v1.length === 0) {
      return 0.0;
    }
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dot += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denom === 0 ? 0 : dot / denom;
  },

  /**
   * Average multiple embedding vectors into one.
   * Used to reduce noise from multiple captured frames.
   */
  averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    if (embeddings.length === 1) return embeddings[0];

    const dim = embeddings[0].length;
    const avg = new Array(dim).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        avg[i] += emb[i];
      }
    }

    // Normalize the averaged vector back to unit length
    let sumSq = 0;
    for (let i = 0; i < dim; i++) {
      avg[i] /= embeddings.length;
      sumSq += avg[i] * avg[i];
    }
    const magnitude = Math.sqrt(sumSq);
    return magnitude > 0 ? avg.map(v => v / magnitude) : avg;
  },

  /**
   * Find the closest matching employee using Cosine Similarity.
   * Returns a match only if confidence >= 70%.
   */
  matchFace(
    faceEmbedding: number[],
    employees: CachedEmployee[],
    _threshold: number = 0.6  // kept for API compatibility, not used
  ): MatchResult {
    if (employees.length === 0 || !faceEmbedding || faceEmbedding.length === 0) {
      return { employee: null, distance: 999, confidence: 0 };
    }

    let closestEmployee: CachedEmployee | null = null;
    let bestSimilarity = -1;

    for (const emp of employees) {
      if (!emp.embeddings || emp.embeddings.length !== faceEmbedding.length) {
        continue;
      }
      const sim = this.cosineSimilarity(faceEmbedding, emp.embeddings);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        closestEmployee = emp;
      }
    }

    if (closestEmployee && bestSimilarity >= 0) {
      const confidence = Math.max(0, Math.min(100, Math.round(bestSimilarity * 100)));
      // Euclidean distance equivalent for reference: sqrt(2 * (1 - similarity))
      const distance = Math.sqrt(Math.max(0, 2 * (1 - bestSimilarity)));

      if (confidence >= 70) {
        return { employee: closestEmployee, distance, confidence };
      }

      return { employee: null, distance, confidence };
    }

    return { employee: null, distance: 999, confidence: 0 };
  },
};
