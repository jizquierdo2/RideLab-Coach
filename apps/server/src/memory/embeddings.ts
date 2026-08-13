import type OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Embedding de `text` vía la API de OpenAI. Recibe el cliente por parámetro
 * (mismo patrón de inyección que el resto del backend, ej. `historicalMetrics`
 * en `OpenAIAgentGateway`) — así `memory/summarizer.ts` puede pasarle un
 * cliente falso en los tests sin pegarle a la red real.
 */
export async function embedText(text: string, client: OpenAI): Promise<number[]> {
  const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return response.data[0]?.embedding ?? [];
}

/**
 * Similitud de coseno entre dos embeddings.
 *
 * Sin librería de vectores: a la escala de un solo usuario, compararlos en JS
 * alcanza de sobra (`memory/repository.ts#searchFragments` la usa sobre los
 * pocos fragmentos guardados por usuario).
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
