import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createMemoryDatabase } from "./db";
import { DEFAULT_USER_ID, MemoryRepository } from "./repository";

const KEY = crypto.randomBytes(32).toString("base64");

let db: Database.Database;
let repo: MemoryRepository;

beforeEach(() => {
  db = createMemoryDatabase(":memory:");
  repo = new MemoryRepository(db, KEY);
});

describe("saveChatMessage / listRecentMessages", () => {
  it("descifra el contenido y conserva dataSources/suggestedActions al leer", () => {
    repo.saveChatMessage({
      id: "msg-1",
      role: "assistant",
      content: "Hoy tienes buena recuperación.",
      createdAt: "2026-08-10T10:00:00.000Z",
      dataSources: [{ type: "garmin", label: "Tu estado de hoy", detail: "Training Readiness 82/100" }],
      suggestedActions: [{ id: "a1", label: "Revisar mi estado", action: "open_status" }],
    });

    const [message] = repo.listRecentMessages(DEFAULT_USER_ID, "2026-08-01T00:00:00.000Z");
    expect(message.content).toBe("Hoy tienes buena recuperación.");
    expect(message.dataSources).toEqual([
      { type: "garmin", label: "Tu estado de hoy", detail: "Training Readiness 82/100" },
    ]);
    expect(message.suggestedActions).toEqual([{ id: "a1", label: "Revisar mi estado", action: "open_status" }]);
  });

  it("el contenido nunca queda en texto plano en la base", () => {
    repo.saveChatMessage({
      id: "msg-2",
      role: "user",
      content: "tengo dolor en la rodilla derecha",
      createdAt: "2026-08-10T10:00:00.000Z",
    });

    const row = db.prepare("SELECT content_encrypted FROM chat_messages WHERE id = ?").get("msg-2") as {
      content_encrypted: string;
    };
    expect(row.content_encrypted).not.toContain("rodilla");
  });

  it("respeta sinceIso y devuelve en orden cronológico", () => {
    repo.saveChatMessage({ id: "old", role: "user", content: "viejo", createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveChatMessage({ id: "new", role: "user", content: "nuevo", createdAt: "2026-08-10T00:00:00.000Z" });

    const messages = repo.listRecentMessages(DEFAULT_USER_ID, "2026-08-05T00:00:00.000Z");
    expect(messages.map((m) => m.id)).toEqual(["new"]);
  });

  it("aísla mensajes por userId", () => {
    repo.saveChatMessage({ id: "mine", userId: "user-a", role: "user", content: "a", createdAt: "2026-08-10T00:00:00.000Z" });
    repo.saveChatMessage({ id: "theirs", userId: "user-b", role: "user", content: "b", createdAt: "2026-08-10T00:00:00.000Z" });

    expect(repo.listRecentMessages("user-a", "2026-01-01T00:00:00.000Z").map((m) => m.id)).toEqual(["mine"]);
  });
});

describe("listUnsummarizedMessages", () => {
  it("sin resúmenes previos, devuelve mensajes anteriores al corte de ventana activa", () => {
    repo.saveChatMessage({ id: "old", role: "user", content: "hace 10 días", createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveChatMessage({ id: "recent", role: "user", content: "hace 1 día", createdAt: "2026-08-09T00:00:00.000Z" });

    const unsummarized = repo.listUnsummarizedMessages(DEFAULT_USER_ID, "2026-08-05T00:00:00.000Z");
    expect(unsummarized.map((m) => m.id)).toEqual(["old"]);
  });

  it("con un resumen previo, sólo devuelve mensajes posteriores a su periodEnd", () => {
    repo.saveSummary({
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
      summary: "resumen previo",
      createdAt: "2026-08-01T00:00:01.000Z",
    });
    repo.saveChatMessage({ id: "already-folded", role: "user", content: "ya resumido", createdAt: "2026-07-15T00:00:00.000Z" });
    repo.saveChatMessage({ id: "pending", role: "user", content: "pendiente", createdAt: "2026-08-02T00:00:00.000Z" });

    const unsummarized = repo.listUnsummarizedMessages(DEFAULT_USER_ID, "2026-08-05T00:00:00.000Z");
    expect(unsummarized.map((m) => m.id)).toEqual(["pending"]);
  });
});

describe("saveSummary / getLatestSummary", () => {
  it("descifra el resumen guardado", () => {
    repo.saveSummary({
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
      summary: "metas: bajar con más control",
      createdAt: "2026-08-01T00:00:01.000Z",
    });

    expect(repo.getLatestSummary(DEFAULT_USER_ID)?.summary).toBe("metas: bajar con más control");
  });

  it("devuelve el más reciente cuando hay varios", () => {
    repo.saveSummary({ periodStart: "a", periodEnd: "b", summary: "primero", createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveSummary({ periodStart: "c", periodEnd: "d", summary: "segundo", createdAt: "2026-08-08T00:00:00.000Z" });

    expect(repo.getLatestSummary(DEFAULT_USER_ID)?.summary).toBe("segundo");
  });

  it("devuelve undefined si no hay ningún resumen", () => {
    expect(repo.getLatestSummary(DEFAULT_USER_ID)).toBeUndefined();
  });
});

describe("saveFragment / searchFragments", () => {
  it("devuelve los fragmentos más similares primero, respetando topK", () => {
    repo.saveFragment({ sourceType: "summary", sourceId: "s1", text: "meta: bajar con control", embedding: [1, 0], createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveFragment({ sourceType: "summary", sourceId: "s2", text: "molestia rodilla derecha", embedding: [0, 1], createdAt: "2026-08-02T00:00:00.000Z" });
    repo.saveFragment({ sourceType: "summary", sourceId: "s3", text: "casi igual a s1", embedding: [0.9, 0.1], createdAt: "2026-08-03T00:00:00.000Z" });

    const results = repo.searchFragments(DEFAULT_USER_ID, [1, 0], 2);
    expect(results.map((f) => f.sourceId)).toEqual(["s1", "s3"]);
  });

  it("aísla fragmentos por userId", () => {
    repo.saveFragment({ userId: "user-a", sourceType: "summary", sourceId: "mine", text: "a", embedding: [1, 0], createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveFragment({ userId: "user-b", sourceType: "summary", sourceId: "theirs", text: "b", embedding: [1, 0], createdAt: "2026-08-01T00:00:00.000Z" });

    expect(repo.searchFragments("user-a", [1, 0], 5).map((f) => f.sourceId)).toEqual(["mine"]);
  });
});

describe("clearUserData", () => {
  it("borra las 3 tablas sólo para el usuario indicado", () => {
    repo.saveChatMessage({ id: "m-a", userId: "user-a", role: "user", content: "a", createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveSummary({ userId: "user-a", periodStart: "a", periodEnd: "b", summary: "resumen a", createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveFragment({ userId: "user-a", sourceType: "summary", sourceId: "f-a", text: "a", embedding: [1], createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveChatMessage({ id: "m-b", userId: "user-b", role: "user", content: "b", createdAt: "2026-08-01T00:00:00.000Z" });

    repo.clearUserData("user-a");

    expect(repo.listRecentMessages("user-a", "2026-01-01T00:00:00.000Z")).toEqual([]);
    expect(repo.getLatestSummary("user-a")).toBeUndefined();
    expect(repo.searchFragments("user-a", [1], 5)).toEqual([]);
    expect(repo.listRecentMessages("user-b", "2026-01-01T00:00:00.000Z")).toHaveLength(1);
  });
});
