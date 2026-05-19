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

    if (closestEmployee && minDistance <= threshold) {
      // Convert Euclidean distance to confidence percentage.
      // For MobileFaceNet, 0.0 distance is 100% confidence, 0.6 threshold is around 70-80% confidence.
      // Let's use a nice scaling formula: confidence = max(0, min(100, Math.round((1 - (distance / threshold) * 0.4) * 100)))
      // Or simply: confidence = Math.round((1 - (minDistance / 1.2)) * 100) -> 0.0 dist is 100%, 0.6 dist is 50%, etc.
      // Let's use:
      const confidence = Math.max(0, Math.min(100, Math.round((1 - minDistance) * 100)));
      return {
        employee: closestEmployee,
        distance: minDistance,
        confidence,
      };
    }

    return {
      employee: null,
      distance: minDistance,
      confidence: 0,
    };
  },

  /**
   * Generate a random normalized 128-dimensional embedding
   */
  generateMockEmbedding(dimension: number = 128): number[] {
    const vector: number[] = [];
    let sumSquares = 0;
    
    // Generate raw values
    for (let i = 0; i < dimension; i++) {
      const val = Math.random() * 2 - 1; // -1 to 1
      vector.push(val);
      sumSquares += val * val;
    }

    // Normalize to unit length (sum of squares = 1)
    const magnitude = Math.sqrt(sumSquares);
    return vector.map(v => v / magnitude);
  },

  /**
   * Generate a repeatable mock embedding for a specific string (e.g. employee name)
   * This ensures that scanning a mockup card for "John Doe" will ALWAYS produce
   * the exact same vector, making testing face-recognition syncing 100% reliable!
   */
  generateMockEmbeddingForName(name: string, dimension: number = 128): number[] {
    // Simple deterministic hash based on name characters
    let seed = 0;
    for (let i = 0; i < name.length; i++) {
      seed += name.charCodeAt(i) * (i + 1);
    }

    const vector: number[] = [];
    let sumSquares = 0;

    for (let i = 0; i < dimension; i++) {
      // Deterministic pseudo-random number generator
      const x = Math.sin(seed + i) * 10000;
      const val = x - Math.floor(x); // 0 to 1
      const centered = val * 2 - 1; // -1 to 1
      vector.push(centered);
      sumSquares += centered * centered;
    }

    const magnitude = Math.sqrt(sumSquares);
    return vector.map(v => v / magnitude);
  }
};
