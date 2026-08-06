import { describe, expect, it } from "vitest";
import { McpGarminDataProvider } from "./mcp";

/**
 * Sólo se testea la precondición pura, sin spawnear el proceso real: hacerlo
 * dependería de red y de una cuenta de Garmin real, y no corresponde en el
 * suite automatizado. El resto (login real, mapeo de datos) se verifica a
 * mano — ver README.
 */
describe("McpGarminDataProvider", () => {
  it("isReady() es false de inmediato si faltan email o password, sin intentar I/O", async () => {
    expect(await new McpGarminDataProvider("", "").isReady()).toBe(false);
    expect(await new McpGarminDataProvider("a@b.com", "").isReady()).toBe(false);
    expect(await new McpGarminDataProvider("", "clave").isReady()).toBe(false);
  });

  it("disconnect() es idempotente incluso sin haber conectado nunca", async () => {
    const provider = new McpGarminDataProvider("a@b.com", "clave");
    await expect(provider.disconnect()).resolves.toBeUndefined();
    await expect(provider.disconnect()).resolves.toBeUndefined();
  });
});
