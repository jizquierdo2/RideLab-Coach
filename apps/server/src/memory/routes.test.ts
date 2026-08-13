import crypto from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createMemoryDatabase } from "./db";
import { registerMemoryRoutes } from "./routes";
import { DEFAULT_USER_ID, MemoryRepository } from "./repository";

const KEY = crypto.randomBytes(32).toString("base64");

let db: Database.Database;
let repository: MemoryRepository;
let server: Server;
let baseUrl: string;

async function startApp(deps: { repository?: MemoryRepository; userId?: string }) {
  const app = express();
  registerMemoryRoutes(app, deps);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
}

beforeEach(() => {
  db = createMemoryDatabase(":memory:");
  repository = new MemoryRepository(db, KEY);
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("DELETE /api/memory", () => {
  it("borra los mensajes, resúmenes y fragmentos del usuario", async () => {
    repository.saveChatMessage({ id: "m1", role: "user", content: "hola", createdAt: "2026-08-01T00:00:00.000Z" });
    repository.saveSummary({ periodStart: "a", periodEnd: "b", summary: "resumen", createdAt: "2026-08-01T00:00:00.000Z" });
    repository.saveFragment({ sourceType: "summary", sourceId: "s1", text: "fragmento", embedding: [1], createdAt: "2026-08-01T00:00:00.000Z" });
    await startApp({ repository });

    const res = await fetch(`${baseUrl}/api/memory`, { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: true });
    expect(repository.listRecentMessages(DEFAULT_USER_ID, "2026-01-01T00:00:00.000Z")).toEqual([]);
    expect(repository.getLatestSummary(DEFAULT_USER_ID)).toBeUndefined();
    expect(repository.searchFragments(DEFAULT_USER_ID, [1], 5)).toEqual([]);
  });

  it("no toca los datos de otro usuario", async () => {
    repository.saveChatMessage({ id: "mine", userId: "user-a", role: "user", content: "a", createdAt: "2026-08-01T00:00:00.000Z" });
    await startApp({ repository, userId: DEFAULT_USER_ID });

    await fetch(`${baseUrl}/api/memory`, { method: "DELETE" });

    expect(repository.listRecentMessages("user-a", "2026-01-01T00:00:00.000Z")).toHaveLength(1);
  });

  it("responde cleared:false sin lanzar si la memoria no está habilitada", async () => {
    await startApp({});

    const res = await fetch(`${baseUrl}/api/memory`, { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: false, reason: expect.any(String) });
  });
});
