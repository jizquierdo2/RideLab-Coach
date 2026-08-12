import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "./db";

describe("createMemoryDatabase", () => {
  it("crea las tres tablas de memoria", () => {
    const db = createMemoryDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["chat_messages", "memory_summaries", "memory_fragments"]));
    db.close();
  });

  it("es idempotente: abrir la misma ruta dos veces no falla", () => {
    const db1 = createMemoryDatabase(":memory:");
    db1.close();
    const db2 = createMemoryDatabase(":memory:");
    db2.close();
  });
});
