import { describe, expect, it } from "vitest";
import { emptyStructuredMemory, structuredMemorySchema } from "./memory";

describe("structuredMemorySchema", () => {
  it("acepta un objeto vacío y completa todos los campos con []", () => {
    const parsed = structuredMemorySchema.parse({});
    expect(parsed).toEqual(emptyStructuredMemory());
  });

  it("acepta una memoria completa", () => {
    const full = {
      goals: ["bajar con más control en pistas técnicas"],
      preferences: ["prefiere entrenar de mañana"],
      limitations: ["molestia crónica de rodilla derecha"],
      routines: ["moviliza tobillos antes de cada sesión"],
      loads: ["sentadilla en 80 kg x 5"],
      feedback: ["sensación de brazos frescos tras sesiones de tracción"],
      decisions: ["mantener carga de piernas, subir tracción levemente"],
      progress: ["subió 5 kg en peso muerto en 6 semanas"],
      adjustments: ["bajar volumen la próxima semana de descarga"],
    };
    expect(structuredMemorySchema.parse(full)).toEqual(full);
  });

  it("rechaza un campo que no sea un array de strings", () => {
    const result = structuredMemorySchema.safeParse({ goals: "no es un array" });
    expect(result.success).toBe(false);
  });
});
