import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * `config` se lee una sola vez al importar el módulo, así que cada test que
 * necesita variables de entorno distintas debe resetear el registro de
 * módulos de vitest y reimportar tanto `../config` como `./token-seed`.
 */

let tmpHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "garmin-seed-test-"));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
});

afterEach(() => {
  process.env.HOME = originalHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.GARMIN_OAUTH1_TOKEN_B64;
  delete process.env.GARMIN_OAUTH2_TOKEN_B64;
  delete process.env.GARMIN_PROFILE_B64;
  vi.resetModules();
});

describe("seedGarminTokenCacheFromEnv", () => {
  it("no hace nada si no hay variables de token configuradas", async () => {
    const { seedGarminTokenCacheFromEnv } = await import("./token-seed");
    seedGarminTokenCacheFromEnv();
    expect(fs.existsSync(path.join(tmpHome, ".garmin-mcp"))).toBe(false);
  });

  it("escribe los archivos de caché decodificando base64", async () => {
    process.env.GARMIN_OAUTH1_TOKEN_B64 = Buffer.from('{"token":"one"}').toString("base64");
    process.env.GARMIN_OAUTH2_TOKEN_B64 = Buffer.from('{"token":"two"}').toString("base64");
    vi.resetModules();

    const { seedGarminTokenCacheFromEnv } = await import("./token-seed");
    seedGarminTokenCacheFromEnv();

    const cacheDir = path.join(tmpHome, ".garmin-mcp");
    expect(fs.readFileSync(path.join(cacheDir, "oauth1_token.json"), "utf8")).toBe('{"token":"one"}');
    expect(fs.readFileSync(path.join(cacheDir, "oauth2_token.json"), "utf8")).toBe('{"token":"two"}');
    expect(fs.existsSync(path.join(cacheDir, "profile.json"))).toBe(false);
  });

  it("no pisa un archivo que ya existe (no retrocede un token ya refrescado)", async () => {
    const cacheDir = path.join(tmpHome, ".garmin-mcp");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "oauth1_token.json"), '{"token":"refreshed"}');

    process.env.GARMIN_OAUTH1_TOKEN_B64 = Buffer.from('{"token":"stale"}').toString("base64");
    vi.resetModules();

    const { seedGarminTokenCacheFromEnv } = await import("./token-seed");
    seedGarminTokenCacheFromEnv();

    expect(fs.readFileSync(path.join(cacheDir, "oauth1_token.json"), "utf8")).toBe('{"token":"refreshed"}');
  });
});
