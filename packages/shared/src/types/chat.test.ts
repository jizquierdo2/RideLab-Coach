import { describe, expect, it } from "vitest";
import { chatMessageSchema } from "./chat";

describe("chatMessageSchema", () => {
  it("acepta un mensaje mínimo: sólo texto conversacional", () => {
    const parsed = chatMessageSchema.safeParse({
      id: "msg1",
      role: "assistant",
      content: "Fue una buena sesión para cumplir, pero te quedó corta de intensidad.",
      createdAt: "2026-08-12T20:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.dataSources).toEqual([]);
      expect(parsed.data.suggestedActions).toEqual([]);
    }
  });

  it("acepta un mensaje completo con dataSources, suggestedActions y followUpQuestion", () => {
    const parsed = chatMessageSchema.safeParse({
      id: "msg2",
      role: "assistant",
      content: "Mantendría las cargas de piernas. ¿Cómo terminaron tus antebrazos: frescos o cansados?",
      createdAt: "2026-08-12T20:00:00.000Z",
      dataSources: [
        { type: "training_session", label: "Cadena posterior y tracción", detail: "67 min 57 s" },
        { type: "garmin", label: "FC de la sesión", detail: "130 ppm promedio" },
      ],
      suggestedActions: [
        { id: "a1", label: "Ajustar próxima sesión", action: "adjust_next_session", targetId: "w1-d2" },
        { id: "a2", label: "Ver datos utilizados", action: "show_used_data" },
      ],
      followUpQuestion: "¿Cómo terminaron tus antebrazos: frescos o cansados?",
    });
    expect(parsed.success).toBe(true);
  });

  it("no tiene ningún campo `analysis` — el schema de informe fue eliminado", () => {
    const parsed = chatMessageSchema.safeParse({
      id: "msg3",
      role: "assistant",
      content: "Texto normal.",
      createdAt: "2026-08-12T20:00:00.000Z",
      analysis: { headline: "esto ya no debería existir" },
    });
    // `analysis` no es un campo reconocido: Zod lo ignora (no lo rechaza por default),
    // pero el resultado parseado no debe contenerlo.
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("analysis");
    }
  });

  it("rechaza más de 3 acciones sugeridas no es una regla del schema — eso se valida en el prompt/mock, no acá", () => {
    // Documenta la decisión: el límite de 3 es una instrucción del agente, no una
    // restricción dura del schema (permitir de más y confiar en el prompt evita
    // que un cambio de criterio futuro requiera tocar el contrato de datos).
    const parsed = chatMessageSchema.safeParse({
      id: "msg4",
      role: "assistant",
      content: "Texto normal.",
      createdAt: "2026-08-12T20:00:00.000Z",
      suggestedActions: [
        { id: "a1", label: "1", action: "open_status" },
        { id: "a2", label: "2", action: "open_status" },
        { id: "a3", label: "3", action: "open_status" },
        { id: "a4", label: "4", action: "open_status" },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
