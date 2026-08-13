/**
 * Similitud de coseno entre dos embeddings.
 *
 * Sin librería de vectores: a la escala de un solo usuario, compararlos en JS
 * alcanza de sobra (`memory/repository.ts#searchFragments` la usa sobre los
 * pocos fragmentos guardados por usuario). `embedText()` (Fase 7) llama a la
 * API de embeddings de OpenAI y vive en este mismo archivo.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
