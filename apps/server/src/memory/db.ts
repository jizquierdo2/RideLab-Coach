import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "../config";

/**
 * Base SQLite de la memoria conversacional.
 *
 * Sin librería de vectores ni ORM: a la escala de un solo usuario, SQLite +
 * `better-sqlite3` (síncrono, sin dependencias nativas adicionales) alcanza
 * de sobra, y evita provisionar infraestructura nueva. Los embeddings de
 * `memory_fragments` se guardan como JSON y se comparan con similitud de
 * coseno en JS (`memory/embeddings.ts`), no con un índice vectorial.
 */

/** Crea (o abre) la base en `dbPath` y aplica las migraciones. Usar `:memory:` en tests. */
export function createMemoryDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL,
      data_sources_json TEXT,
      suggested_actions_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages (user_id, created_at);

    CREATE TABLE IF NOT EXISTS memory_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      summary_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL,
      supersedes_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memory_summaries_user_created ON memory_summaries (user_id, created_at);

    CREATE TABLE IF NOT EXISTS memory_fragments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      text_encrypted TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_fragments_user ON memory_fragments (user_id);
  `);
}

let singleton: Database.Database | undefined;

/** Conexión única para el proceso del backend, sobre `config.memory.databasePath`. */
export function getMemoryDb(): Database.Database {
  if (!singleton) singleton = createMemoryDatabase(config.memory.databasePath);
  return singleton;
}
