import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { cosineSimilarity, embedText } from "./embeddings";

function fakeClient(create: ReturnType<typeof vi.fn>): OpenAI {
  return { embeddings: { create } } as unknown as OpenAI;
}

describe("cosineSimilarity", () => {
  it("devuelve 1 para vectores idénticos", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("devuelve 0 para vectores ortogonales", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("devuelve -1 para vectores opuestos", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it("devuelve 0 si algún vector es todo ceros, sin dividir por cero", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("devuelve 0 si los vectores tienen largos distintos", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe("embedText", () => {
  it("pide el modelo text-embedding-3-small y devuelve el embedding", async () => {
    const create = vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });

    const result = await embedText("meta: bajar con más control", fakeClient(create));

    expect(create).toHaveBeenCalledWith({ model: "text-embedding-3-small", input: "meta: bajar con más control" });
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("devuelve un array vacío si la API no trae datos", async () => {
    const create = vi.fn().mockResolvedValue({ data: [] });

    const result = await embedText("texto", fakeClient(create));

    expect(result).toEqual([]);
  });
});
