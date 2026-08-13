import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createMemoryDatabase } from "./db";
import { buildMemoryContext } from "./context";
import { DEFAULT_USER_ID, MemoryRepository } from "./repository";

const KEY = crypto.randomBytes(32).toString("base64");
const NOW = new Date("2026-08-10T00:00:00.000Z");

let db: Database.Database;
let repo: MemoryRepository;

beforeEach(() => {
  db = createMemoryDatabase(":memory:");
  repo = new MemoryRepository(db, KEY);
});

describe("buildMemoryContext", () => {
  it("devuelve undefined si no hay nada guardado todavía", async () => {
    const context = await buildMemoryContext(repo, "¿cómo estuvo mi entrenamiento?", { now: NOW });
    expect(context).toBeUndefined();
  });

  it("incluye los mensajes de los últimos 7 días, en orden cronológico", async () => {
    repo.saveChatMessage({ id: "m1", role: "user", content: "¿cómo estuvo ayer?", createdAt: "2026-08-09T10:00:00.000Z" });
    repo.saveChatMessage({ id: "m2", role: "assistant", content: "Sólida, buen ritmo.", createdAt: "2026-08-09T10:00:05.000Z" });

    const context = await buildMemoryContext(repo, "otra pregunta", { now: NOW });
    expect(context).toContain("Usuario: ¿cómo estuvo ayer?");
    expect(context).toContain("Coach: Sólida, buen ritmo.");
    expect(context!.indexOf("¿cómo estuvo ayer?")).toBeLessThan(context!.indexOf("Sólida, buen ritmo."));
  });

  it("excluye mensajes fuera de la ventana activa de 7 días", async () => {
    repo.saveChatMessage({ id: "old", role: "user", content: "hace dos semanas", createdAt: "2026-07-25T00:00:00.000Z" });

    const context = await buildMemoryContext(repo, "pregunta", { now: NOW });
    expect(context).toBeUndefined();
  });

  it("incluye el resumen estructurado vigente", async () => {
    repo.saveSummary({
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
      summary: "La semana pasada acordamos mantener la carga de piernas.",
      createdAt: "2026-08-01T00:00:01.000Z",
    });

    const context = await buildMemoryContext(repo, "pregunta", { now: NOW });
    expect(context).toContain("mantener la carga de piernas");
  });

  it("sin embedQuery, no intenta búsqueda semántica y no falla", async () => {
    repo.saveFragment({ sourceType: "summary", sourceId: "f1", text: "fragmento relevante", embedding: [1, 0], createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveChatMessage({ id: "m1", role: "user", content: "pregunta", createdAt: "2026-08-09T00:00:00.000Z" });

    const context = await buildMemoryContext(repo, "pregunta", { now: NOW });
    expect(context).not.toContain("fragmento relevante");
  });

  it("con embedQuery, ordena los fragmentos por relevancia (coseno)", async () => {
    repo.saveFragment({ sourceType: "summary", sourceId: "f1", text: "acordamos subir tracción", embedding: [1, 0], createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveFragment({ sourceType: "summary", sourceId: "f2", text: "molestia de rodilla antigua", embedding: [0, 1], createdAt: "2026-08-01T00:00:00.000Z" });

    const context = await buildMemoryContext(repo, "¿subo la tracción hoy?", {
      now: NOW,
      embedQuery: async () => [1, 0],
    });
    expect(context).toContain("acordamos subir tracción");
    expect(context!.indexOf("acordamos subir tracción")).toBeLessThan(context!.indexOf("molestia de rodilla antigua"));
  });

  it("si embedQuery falla, sigue devolviendo el resto del contexto sin lanzar", async () => {
    repo.saveChatMessage({ id: "m1", role: "user", content: "pregunta reciente", createdAt: "2026-08-09T00:00:00.000Z" });

    const context = await buildMemoryContext(repo, "pregunta", {
      now: NOW,
      embedQuery: async () => {
        throw new Error("openai caído");
      },
    });
    expect(context).toContain("pregunta reciente");
  });

  it("respeta userId al construir el contexto", async () => {
    repo.saveChatMessage({ id: "mine", userId: "user-a", role: "user", content: "mío", createdAt: "2026-08-09T00:00:00.000Z" });
    repo.saveChatMessage({ id: "theirs", userId: DEFAULT_USER_ID, role: "user", content: "de otro", createdAt: "2026-08-09T00:00:00.000Z" });

    const context = await buildMemoryContext(repo, "pregunta", { now: NOW, userId: "user-a" });
    expect(context).toContain("mío");
    expect(context).not.toContain("de otro");
  });
});
