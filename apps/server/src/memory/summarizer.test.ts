import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { emptyStructuredMemory } from "@ridelab/shared";
import { createMemoryDatabase } from "./db";
import { DEFAULT_USER_ID, MemoryRepository } from "./repository";
import { summarizeIfDue, type SummarizingAgentGateway } from "./summarizer";

const KEY = crypto.randomBytes(32).toString("base64");
const NOW = new Date("2026-08-10T00:00:00.000Z");

let db: Database.Database;
let repo: MemoryRepository;

function fakeGateway(summarizeMemory: ReturnType<typeof vi.fn>): SummarizingAgentGateway {
  return { summarizeMemory };
}

beforeEach(() => {
  db = createMemoryDatabase(":memory:");
  repo = new MemoryRepository(db, KEY);
});

describe("summarizeIfDue", () => {
  it("no hace nada si no hay mensajes fuera de la ventana activa", async () => {
    repo.saveChatMessage({ id: "m1", role: "user", content: "reciente", createdAt: "2026-08-09T00:00:00.000Z" });
    const summarizeMemory = vi.fn();

    await summarizeIfDue(repo, fakeGateway(summarizeMemory), vi.fn(), DEFAULT_USER_ID, NOW);

    expect(summarizeMemory).not.toHaveBeenCalled();
    expect(repo.getLatestSummary(DEFAULT_USER_ID)).toBeUndefined();
  });

  it("sin resumen previo, resume los mensajes viejos con memoria vacía como base", async () => {
    repo.saveChatMessage({ id: "m1", role: "user", content: "quedé fresco de brazos", createdAt: "2026-08-01T00:00:00.000Z" });
    repo.saveChatMessage({ id: "m2", role: "assistant", content: "mantengo la carga entonces", createdAt: "2026-08-01T00:00:05.000Z" });

    const updated = { ...emptyStructuredMemory(), decisions: ["mantener carga de piernas"] };
    const summarizeMemory = vi.fn().mockResolvedValue(updated);
    const embed = vi.fn().mockResolvedValue([1, 0]);

    await summarizeIfDue(repo, fakeGateway(summarizeMemory), embed, DEFAULT_USER_ID, NOW);

    expect(summarizeMemory).toHaveBeenCalledWith(
      emptyStructuredMemory(),
      expect.arrayContaining([
        { role: "user", content: "quedé fresco de brazos" },
        { role: "assistant", content: "mantengo la carga entonces" },
      ]),
    );

    const saved = repo.getLatestSummary(DEFAULT_USER_ID);
    expect(saved).toBeDefined();
    expect(JSON.parse(saved!.summary)).toEqual(updated);
    expect(saved!.supersedesId).toBeUndefined();
  });

  it("guarda un fragmento embebido por cada entrada de la memoria actualizada", async () => {
    repo.saveChatMessage({ id: "m1", role: "user", content: "viejo", createdAt: "2026-08-01T00:00:00.000Z" });
    const updated = { ...emptyStructuredMemory(), goals: ["bajar con más control"], loads: ["sentadilla 80kg x5"] };
    const summarizeMemory = vi.fn().mockResolvedValue(updated);
    const embed = vi.fn().mockResolvedValue([1, 0]);

    await summarizeIfDue(repo, fakeGateway(summarizeMemory), embed, DEFAULT_USER_ID, NOW);

    expect(embed).toHaveBeenCalledTimes(2);
    expect(embed).toHaveBeenCalledWith("Meta: bajar con más control");
    expect(embed).toHaveBeenCalledWith("Carga acordada: sentadilla 80kg x5");

    const fragments = repo.searchFragments(DEFAULT_USER_ID, [1, 0], 10);
    expect(fragments.map((f) => f.text).sort()).toEqual(["Carga acordada: sentadilla 80kg x5", "Meta: bajar con más control"]);
  });

  it("respeta la ventana de 24h desde el último resumen", async () => {
    repo.saveSummary({
      userId: DEFAULT_USER_ID,
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
      summary: JSON.stringify(emptyStructuredMemory()),
      createdAt: "2026-08-09T12:00:00.000Z", // hace 12h respecto de NOW
    });
    repo.saveChatMessage({ id: "m1", role: "user", content: "posterior al resumen", createdAt: "2026-08-01T12:00:00.000Z" });

    const summarizeMemory = vi.fn();
    await summarizeIfDue(repo, fakeGateway(summarizeMemory), vi.fn(), DEFAULT_USER_ID, NOW);

    expect(summarizeMemory).not.toHaveBeenCalled();
  });

  it("con un resumen previo de hace más de 24h, parte de él y lo reemplaza (supersedesId)", async () => {
    const previousSaved = repo.saveSummary({
      userId: DEFAULT_USER_ID,
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-07-20T00:00:00.000Z",
      summary: JSON.stringify({ ...emptyStructuredMemory(), goals: ["meta vieja"] }),
      createdAt: "2026-08-05T00:00:00.000Z", // hace más de 24h de NOW
    });
    repo.saveChatMessage({ id: "m1", role: "user", content: "mensaje posterior al resumen previo", createdAt: "2026-07-25T00:00:00.000Z" });

    const summarizeMemory = vi.fn().mockResolvedValue({ ...emptyStructuredMemory(), goals: ["meta vieja", "meta nueva"] });
    await summarizeIfDue(repo, fakeGateway(summarizeMemory), vi.fn().mockResolvedValue([1]), DEFAULT_USER_ID, NOW);

    expect(summarizeMemory).toHaveBeenCalledWith(
      { ...emptyStructuredMemory(), goals: ["meta vieja"] },
      [{ role: "user", content: "mensaje posterior al resumen previo" }],
    );
    const latest = repo.getLatestSummary(DEFAULT_USER_ID);
    expect(latest!.supersedesId).toBe(previousSaved.id);
  });

  it("si summarizeMemory falla, no guarda ningún resumen ni lanza", async () => {
    repo.saveChatMessage({ id: "m1", role: "user", content: "viejo", createdAt: "2026-08-01T00:00:00.000Z" });
    const summarizeMemory = vi.fn().mockRejectedValue(new Error("openai caído"));

    await expect(summarizeIfDue(repo, fakeGateway(summarizeMemory), vi.fn(), DEFAULT_USER_ID, NOW)).resolves.toBeUndefined();
    expect(repo.getLatestSummary(DEFAULT_USER_ID)).toBeUndefined();
  });

  it("si falla el embedding de un fragmento, guarda igual el resumen y el resto de los fragmentos", async () => {
    repo.saveChatMessage({ id: "m1", role: "user", content: "viejo", createdAt: "2026-08-01T00:00:00.000Z" });
    const updated = { ...emptyStructuredMemory(), goals: ["meta 1", "meta 2"] };
    const summarizeMemory = vi.fn().mockResolvedValue(updated);
    const embed = vi.fn().mockRejectedValueOnce(new Error("falló el embedding")).mockResolvedValueOnce([1, 0]);

    await summarizeIfDue(repo, fakeGateway(summarizeMemory), embed, DEFAULT_USER_ID, NOW);

    expect(repo.getLatestSummary(DEFAULT_USER_ID)).toBeDefined();
    const fragments = repo.searchFragments(DEFAULT_USER_ID, [1, 0], 10);
    expect(fragments).toHaveLength(1);
  });
});
