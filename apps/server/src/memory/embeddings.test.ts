import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./embeddings";

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
