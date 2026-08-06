import { describe, expect, it } from "vitest";
import { assertReadOnlyTool, isReadOnlyTool, GARMIN_READ_ONLY_TOOLS } from "./provider";
import { MockGarminDataProvider } from "./mock";

describe("allowlist de sólo lectura", () => {
  it("permite las herramientas de consulta que necesita el coach", () => {
    for (const tool of GARMIN_READ_ONLY_TOOLS) {
      expect(isReadOnlyTool(tool)).toBe(true);
    }
  });

  it("bloquea todas las herramientas de escritura del MCP de Garmin", () => {
    const writeTools = [
      "set_activity_name",
      "create_manual_activity",
      "delete_activity",
      "add_weigh_in",
      "set_hydration",
      "set_blood_pressure",
      "add_gear_to_activity",
      "remove_gear_from_activity",
    ];

    for (const tool of writeTools) {
      expect(isReadOnlyTool(tool), `${tool} no debería estar permitida`).toBe(false);
      expect(() => assertReadOnlyTool(tool)).toThrow(/allowlist/);
    }
  });

  it("bloquea cualquier tool desconocida", () => {
    expect(() => assertReadOnlyTool("get_something_new")).toThrow();
  });
});

describe("MockGarminDataProvider", () => {
  it("marca siempre la fuente como simulada y sin conexión", async () => {
    const snapshot = await new MockGarminDataProvider().getSnapshot();
    expect(snapshot.dataSource).toBe("mock");
    expect(snapshot.connected).toBe(false);
  });

  it("declara periodo y última sincronización", async () => {
    const snapshot = await new MockGarminDataProvider().getSnapshot(14);
    expect(snapshot.period).toContain("14 días");
    expect(snapshot.lastSyncAt).toBeTruthy();
  });
});
