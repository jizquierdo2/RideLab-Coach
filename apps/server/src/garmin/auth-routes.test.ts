import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GarminDataProvider } from "./provider";
import { MockGarminDataProvider } from "./mock";
import { registerGarminAuthRoutes, type ConnectableGarminProvider } from "./auth-routes";

/** Proveedor falso: nunca spawnea nada real, el test controla el resultado. */
class FakeConnectableProvider implements ConnectableGarminProvider {
  readonly name = "FakeConnectableProvider";
  disconnectCalls = 0;

  constructor(private readonly loginResult: { ok: true } | { ok: false; message: string }) {}

  async isReady() {
    return this.loginResult.ok;
  }

  async getSnapshot(): Promise<never> {
    throw new Error("no usado en estos tests");
  }

  async getActivities() {
    return [];
  }

  async verifyLogin() {
    return this.loginResult;
  }

  async disconnect() {
    this.disconnectCalls += 1;
  }
}

let server: Server;
let baseUrl: string;
let dir: string;
let envFilePath: string;
let provider: GarminDataProvider;
let mockMode: boolean;
let nextCandidate: FakeConnectableProvider;

function post(path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ridelab-auth-routes-"));
  envFilePath = path.join(dir, ".env");
  mockMode = false;
  provider = new MockGarminDataProvider();
  nextCandidate = new FakeConnectableProvider({ ok: true });

  const app = express();
  app.use(express.json());
  registerGarminAuthRoutes(app, {
    envFilePath,
    isMockMode: () => mockMode,
    getProvider: () => provider,
    setProvider: (p) => {
      provider = p;
    },
    createCandidate: () => nextCandidate,
    connectTimeoutMs: 500,
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("POST /api/garmin/connect", () => {
  it("rechaza un body inválido con 400", async () => {
    const res = await post("/api/garmin/connect", { email: "no-es-un-email" });
    expect(res.status).toBe(400);
  });

  it("rechaza con 409 y no toca .env si MOCK_MODE está activo", async () => {
    mockMode = true;
    const res = await post("/api/garmin/connect", { email: "a@b.com", password: "x" });
    expect(res.status).toBe(409);
    expect(fs.existsSync(envFilePath)).toBe(false);
  });

  it("responde 401 y no cambia el proveedor si el login falla", async () => {
    nextCandidate = new FakeConnectableProvider({ ok: false, message: "credenciales inválidas o MFA" });
    const before = provider;

    const res = await post("/api/garmin/connect", { email: "a@b.com", password: "x" });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("MFA");
    expect(provider).toBe(before);
    expect(nextCandidate.disconnectCalls).toBe(1);
    expect(fs.existsSync(envFilePath)).toBe(false);
  });

  it("reemplaza el proveedor y persiste las credenciales cuando el login funciona", async () => {
    const res = await post("/api/garmin/connect", { email: "real@b.com", password: "clave" });

    expect(res.status).toBe(200);
    expect(provider).toBe(nextCandidate);

    const dotenv = await import("dotenv");
    const parsed = dotenv.parse(fs.readFileSync(envFilePath));
    expect(parsed.GARMIN_EMAIL).toBe("real@b.com");
    expect(parsed.GARMIN_PASSWORD).toBe("clave");
  });

  it("desconecta el proveedor real anterior antes de reemplazarlo", async () => {
    const first = new FakeConnectableProvider({ ok: true });
    provider = first;
    nextCandidate = new FakeConnectableProvider({ ok: true });

    await post("/api/garmin/connect", { email: "a@b.com", password: "x" });

    expect(first.disconnectCalls).toBe(1);
    expect(provider).toBe(nextCandidate);
  });
});

describe("POST /api/garmin/disconnect", () => {
  it("vuelve a Mock y borra las credenciales guardadas", async () => {
    fs.writeFileSync(envFilePath, "GARMIN_EMAIL='a@b.com'\nGARMIN_PASSWORD='x'\nPORT=8787");
    const real = new FakeConnectableProvider({ ok: true });
    provider = real;

    const res = await post("/api/garmin/disconnect");

    expect(res.status).toBe(200);
    expect(provider).toBeInstanceOf(MockGarminDataProvider);
    expect(real.disconnectCalls).toBe(1);

    const lines = fs.readFileSync(envFilePath, "utf8").split("\n");
    expect(lines).toEqual(["PORT=8787"]);
  });
});
