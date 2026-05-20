import { CachedEmployee } from './storage';

export interface MatchResult {
  employee: CachedEmployee | null;
  distance: number;
  confidence: number;
}

export const faceMatcherService = {
  /**
   * Calculate Euclidean Distance between two vector arrays
   */
  calculateEuclideanDistance(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length !== v2.length || v1.length === 0) {
      return 999.0; // Return high distance if invalid
    }

    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      const diff = v1[i] - v2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  },

  /**
   * Find the closest matching employee vector below a threshold
   */
  matchFace(
    faceEmbedding: number[],
    employees: CachedEmployee[],
    threshold: number = 0.6
  ): MatchResult {
    if (employees.length === 0 || !faceEmbedding || faceEmbedding.length === 0) {
      return { employee: null, distance: 999, confidence: 0 };
    }

    let closestEmployee: CachedEmployee | null = null;
    let minDistance = 999.0;

    for (const emp of employees) {
      if (!emp.embeddings || emp.embeddings.length !== faceEmbedding.length) {
        continue;
      }
      const dist = this.calculateEuclideanDistance(faceEmbedding, emp.embeddings);
      if (dist < minDistance) {
        minDistance = dist;
        closestEmployee = emp;
      }
    }

    if (closestEmployee) {
      // For normalized L2 embeddings, Cosine Similarity = 1 - (L2_distance ^ 2) / 2
      // We convert this to a percentage (0 to 100).
      const cosineSimilarity = 1 - (minDistance * minDistance) / 2;
      const confidence = Math.max(0, Math.min(100, Math.round(cosineSimilarity * 100)));

      // Only apply attendance if 90% match or higher
      if (confidence >= 90) {
        return {
          employee: closestEmployee,
          distance: minDistance,
          confidence,
        };
      }
    }

    return {
      employee: null,
      distance: minDistance,
      confidence: closestEmployee ? Math.max(0, Math.min(100, Math.round((1 - (minDistance * minDistance) / 2) * 100))) : 0,
    };
  },
};
