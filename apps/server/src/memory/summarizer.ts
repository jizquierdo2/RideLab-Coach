import { emptyStructuredMemory, structuredMemorySchema, type StructuredMemory } from "@ridelab/shared";
import { config } from "../config";
import { DEFAULT_USER_ID, type MemoryRepository } from "./repository";

const MIN_HOURS_BETWEEN_RUNS = 24;

/** Lo único que `summarizeIfDue` necesita del gateway — evita acoplarse a `OpenAIAgentGateway` entero. */
export interface SummarizingAgentGateway {
  summarizeMemory(
    previousSummary: StructuredMemory,
    newMessages: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<StructuredMemory>;
}

/** Prefijo en español de cada categoría, para que los fragmentos embebidos se lean como una frase. */
const CATEGORY_LABELS: Record<keyof StructuredMemory, string> = {
  goals: "Meta",
  preferences: "Preferencia",
  limitations: "Limitación",
  routines: "Rutina",
  loads: "Carga acordada",
  feedback: "Feedback",
  decisions: "Decisión acordada",
  progress: "Progreso",
  adjustments: "Ajuste pendiente",
};

/**
 * Dispara el resumen periódico de memoria si corresponde: hay mensajes que ya
 * salieron de la ventana activa (7 días) sin resumir todavía, y pasaron al
 * menos 24h desde el último resumen (para no resumir en cada request si hay
 * actividad seguida). Pensada para llamarse "fire and forget" desde
 * `/api/chat` (`void summarizeIfDue(...)`) — nunca bloquea la respuesta al
 * usuario; cualquier error se registra y se reintenta en la próxima
 * ejecución, sin perder lo que ya había.
 */
export async function summarizeIfDue(
  repository: MemoryRepository,
  agentGateway: SummarizingAgentGateway,
  embed: (text: string) => Promise<number[]>,
  userId: string = DEFAULT_USER_ID,
  now: Date = new Date(),
): Promise<void> {
  const activeWindowStartIso = new Date(
    now.getTime() - config.memory.activeWindowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const unsummarized = repository
    .listUnsummarizedMessages(userId, activeWindowStartIso)
    .filter((m) => m.role === "user" || m.role === "assistant");
  if (!unsummarized.length) return;

  const latest = repository.getLatestSummary(userId);
  if (latest) {
    const hoursSinceLastRun = (now.getTime() - new Date(latest.createdAt).getTime()) / (60 * 60 * 1000);
    if (hoursSinceLastRun < MIN_HOURS_BETWEEN_RUNS) return;
  }

  const previousSummary = latest ? parseSummary(latest.summary) : emptyStructuredMemory();
  const newMessages = unsummarized.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  let updated: StructuredMemory;
  try {
    updated = await agentGateway.summarizeMemory(previousSummary, newMessages);
  } catch (error) {
    console.warn("[memory] summarizeIfDue falló, se reintenta en el próximo turno:", error instanceof Error ? error.message : error);
    return;
  }

  const saved = repository.saveSummary({
    userId,
    periodStart: unsummarized[0].createdAt,
    periodEnd: unsummarized[unsummarized.length - 1].createdAt,
    summary: JSON.stringify(updated),
    createdAt: now.toISOString(),
    supersedesId: latest?.id,
  });

  await saveFragments(repository, userId, saved.id, updated, now, embed);
}

/** Resumen previo corrupto o de un formato viejo: se parte de vacío en vez de fallar. */
function parseSummary(raw: string): StructuredMemory {
  try {
    const parsed = structuredMemorySchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // JSON inválido: mismo caso, se ignora.
  }
  return emptyStructuredMemory();
}

/** Un fragmento embebido por entrada (no uno por categoría): da búsqueda semántica más fina. */
async function saveFragments(
  repository: MemoryRepository,
  userId: string,
  summaryId: string,
  memory: StructuredMemory,
  now: Date,
  embed: (text: string) => Promise<number[]>,
): Promise<void> {
  for (const key of Object.keys(CATEGORY_LABELS) as Array<keyof StructuredMemory>) {
    for (const item of memory[key]) {
      const text = `${CATEGORY_LABELS[key]}: ${item}`;
      try {
        const embedding = await embed(text);
        repository.saveFragment({ userId, sourceType: "summary", sourceId: summaryId, text, embedding, createdAt: now.toISOString() });
      } catch (error) {
        console.warn("[memory] no se pudo generar el embedding de un fragmento, se omite:", error instanceof Error ? error.message : error);
      }
    }
  }
}
