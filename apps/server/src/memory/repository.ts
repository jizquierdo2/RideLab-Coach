import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ChatDataSource, ChatRole, SuggestedAction } from "@ridelab/shared";
import { config } from "../config";
import { decrypt, encrypt } from "./encryption";
import { cosineSimilarity } from "./embeddings";

/**
 * No hay autenticación de usuarios de la app (ver AGENTS.md) — se reserva
 * este `userId` fijo para que agregar cuentas reales más adelante sea una
 * migración de auth, no de schema.
 */
export const DEFAULT_USER_ID = "default";

export interface StoredChatMessage {
  id: string;
  userId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  dataSources?: ChatDataSource[];
  suggestedActions?: SuggestedAction[];
}

export interface StoredSummary {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  /** Texto (JSON de `structuredMemorySchema`, Fase 7) — cifrado en reposo, se descifra acá. */
  summary: string;
  createdAt: string;
  supersedesId?: string;
}

export interface StoredFragment {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  text: string;
  embedding: number[];
  createdAt: string;
}

interface ChatMessageRow {
  id: string;
  user_id: string;
  role: string;
  content_encrypted: string;
  created_at: string;
  data_sources_json: string | null;
  suggested_actions_json: string | null;
}

interface SummaryRow {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  summary_encrypted: string;
  created_at: string;
  supersedes_id: string | null;
}

interface FragmentRow {
  id: string;
  user_id: string;
  source_type: string;
  source_id: string;
  text_encrypted: string;
  embedding_json: string;
  created_at: string;
}

/**
 * Acceso a la memoria conversacional persistente.
 *
 * Cifra/descifra en el borde (`encryption.ts`): nada que salga de esta clase
 * hacia el resto del backend queda cifrado, y nada que entre se guarda en
 * texto plano. `dataSources`/`suggestedActions` se guardan sin cifrar (son
 * metadata de UI ya derivada, no la conversación en sí).
 *
 * Nunca se persisten tokens ni credenciales de Garmin/MCP: `index.ts` sólo le
 * pasa a `saveChatMessage` el texto que el usuario escribió y el `content`/
 * `dataSources`/`suggestedActions` que ya devolvió el agente — nunca el
 * `GarminSnapshot` ni el `GarminDataProvider` completos. `describeDataSource`
 * en `agent/openai.ts` (la única fuente de `dataSources`) sólo extrae valores
 * cortos ya formateados (ej. "Training Readiness 82/100"), nunca campos
 * crudos del snapshot. `garminConnectRequestSchema.password` (la única
 * credencial que existe en este backend) no tiene ningún camino hacia esta
 * clase.
 */
export class MemoryRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly encryptionKey: string = config.memory.encryptionKey,
  ) {}

  saveChatMessage(message: Omit<StoredChatMessage, "userId"> & { userId?: string }): void {
    const userId = message.userId ?? DEFAULT_USER_ID;
    this.db
      .prepare(
        `INSERT INTO chat_messages (id, user_id, role, content_encrypted, created_at, data_sources_json, suggested_actions_json)
         VALUES (@id, @userId, @role, @content, @createdAt, @dataSources, @suggestedActions)`,
      )
      .run({
        id: message.id,
        userId,
        role: message.role,
        content: encrypt(message.content, this.encryptionKey),
        createdAt: message.createdAt,
        dataSources: message.dataSources?.length ? JSON.stringify(message.dataSources) : null,
        suggestedActions: message.suggestedActions?.length ? JSON.stringify(message.suggestedActions) : null,
      });
  }

  /** Mensajes de `userId` desde `sinceIso` (inclusive), en orden cronológico. */
  listRecentMessages(userId: string, sinceIso: string): StoredChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM chat_messages WHERE user_id = ? AND created_at >= ? ORDER BY created_at ASC`,
      )
      .all(userId, sinceIso) as ChatMessageRow[];
    return rows.map((row) => this.hydrateMessage(row));
  }

  /**
   * Mensajes que todavía no entraron a ningún resumen y ya salieron de la
   * ventana activa (más viejos que `config.memory.activeWindowDays`) — lo que
   * `summarizeIfDue()` (Fase 7) debe plegar en el próximo resumen. El límite
   * inferior es el `periodEnd` del último resumen guardado (o el epoch, si
   * todavía no hay ninguno).
   */
  listUnsummarizedMessages(userId: string, activeWindowStartIso: string): StoredChatMessage[] {
    const latest = this.getLatestSummary(userId);
    const sinceIso = latest?.periodEnd ?? new Date(0).toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM chat_messages WHERE user_id = ? AND created_at > ? AND created_at < ? ORDER BY created_at ASC`,
      )
      .all(userId, sinceIso, activeWindowStartIso) as ChatMessageRow[];
    return rows.map((row) => this.hydrateMessage(row));
  }

  saveSummary(summary: Omit<StoredSummary, "id" | "userId"> & { id?: string; userId?: string }): StoredSummary {
    const id = summary.id ?? randomUUID();
    const userId = summary.userId ?? DEFAULT_USER_ID;
    this.db
      .prepare(
        `INSERT INTO memory_summaries (id, user_id, period_start, period_end, summary_encrypted, created_at, supersedes_id)
         VALUES (@id, @userId, @periodStart, @periodEnd, @summary, @createdAt, @supersedesId)`,
      )
      .run({
        id,
        userId,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        summary: encrypt(summary.summary, this.encryptionKey),
        createdAt: summary.createdAt,
        supersedesId: summary.supersedesId ?? null,
      });
    return { ...summary, id, userId };
  }

  getLatestSummary(userId: string): StoredSummary | undefined {
    const row = this.db
      .prepare(`SELECT * FROM memory_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(userId) as SummaryRow | undefined;
    return row ? this.hydrateSummary(row) : undefined;
  }

  saveFragment(fragment: Omit<StoredFragment, "id" | "userId"> & { id?: string; userId?: string }): void {
    const id = fragment.id ?? randomUUID();
    const userId = fragment.userId ?? DEFAULT_USER_ID;
    this.db
      .prepare(
        `INSERT INTO memory_fragments (id, user_id, source_type, source_id, text_encrypted, embedding_json, created_at)
         VALUES (@id, @userId, @sourceType, @sourceId, @text, @embedding, @createdAt)`,
      )
      .run({
        id,
        userId,
        sourceType: fragment.sourceType,
        sourceId: fragment.sourceId,
        text: encrypt(fragment.text, this.encryptionKey),
        embedding: JSON.stringify(fragment.embedding),
        createdAt: fragment.createdAt,
      });
  }

  /** Top `topK` fragmentos de `userId` más similares a `queryEmbedding` (coseno). */
  searchFragments(userId: string, queryEmbedding: number[], topK: number): StoredFragment[] {
    const rows = this.db.prepare(`SELECT * FROM memory_fragments WHERE user_id = ?`).all(userId) as FragmentRow[];
    return rows
      .map((row) => this.hydrateFragment(row))
      .map((fragment) => ({ fragment, score: cosineSimilarity(queryEmbedding, fragment.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ fragment }) => fragment);
  }

  /** Borra todo lo guardado de `userId` en las 3 tablas — usado por `DELETE /api/memory` (Fase 8). */
  clearUserData(userId: string): void {
    this.db.prepare(`DELETE FROM chat_messages WHERE user_id = ?`).run(userId);
    this.db.prepare(`DELETE FROM memory_summaries WHERE user_id = ?`).run(userId);
    this.db.prepare(`DELETE FROM memory_fragments WHERE user_id = ?`).run(userId);
  }

  private hydrateMessage(row: ChatMessageRow): StoredChatMessage {
    return {
      id: row.id,
      userId: row.user_id,
      role: row.role as ChatRole,
      content: decrypt(row.content_encrypted, this.encryptionKey),
      createdAt: row.created_at,
      dataSources: row.data_sources_json ? (JSON.parse(row.data_sources_json) as ChatDataSource[]) : undefined,
      suggestedActions: row.suggested_actions_json
        ? (JSON.parse(row.suggested_actions_json) as SuggestedAction[])
        : undefined,
    };
  }

  private hydrateSummary(row: SummaryRow): StoredSummary {
    return {
      id: row.id,
      userId: row.user_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      summary: decrypt(row.summary_encrypted, this.encryptionKey),
      createdAt: row.created_at,
      supersedesId: row.supersedes_id ?? undefined,
    };
  }

  private hydrateFragment(row: FragmentRow): StoredFragment {
    return {
      id: row.id,
      userId: row.user_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      text: decrypt(row.text_encrypted, this.encryptionKey),
      embedding: JSON.parse(row.embedding_json) as number[],
      createdAt: row.created_at,
    };
  }
}
