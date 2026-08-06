import type { Express } from "express";
import { garminConnectRequestSchema } from "@ridelab/shared";
import type { GarminDataProvider } from "./provider";
import { MockGarminDataProvider } from "./mock";
import { upsertEnvVars, removeEnvVars } from "../env-file";

/** Superficie que necesita un proveedor real para poder conectarse/desconectarse. */
export interface ConnectableGarminProvider extends GarminDataProvider {
  verifyLogin(): Promise<{ ok: true } | { ok: false; message: string }>;
  disconnect(): Promise<void>;
}

function isConnectable(provider: GarminDataProvider): provider is ConnectableGarminProvider {
  return typeof (provider as Partial<ConnectableGarminProvider>).disconnect === "function";
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * Dependencias inyectables para poder testear el swap/persistencia del
 * singleton sin spawnear el proceso real del MCP.
 */
export interface GarminAuthDeps {
  envFilePath: string;
  isMockMode: () => boolean;
  getProvider: () => GarminDataProvider;
  setProvider: (provider: GarminDataProvider) => void;
  createCandidate: (email: string, password: string) => ConnectableGarminProvider;
  connectTimeoutMs?: number;
}

/**
 * Registra `POST /api/garmin/connect` y `POST /api/garmin/disconnect`.
 *
 * `connect`: valida credenciales, fuerza el login ahora (no espera a la
 * primera petición real), y si funciona reemplaza el proveedor global y
 * persiste las credenciales en `.env` para que un reinicio del backend
 * reconecte solo. `disconnect` hace lo simétrico: vuelve a Mock y borra las
 * credenciales guardadas — un "desconectar" real, no solo en memoria.
 */
export function registerGarminAuthRoutes(app: Express, deps: GarminAuthDeps): void {
  const timeoutMs = deps.connectTimeoutMs ?? 20_000;

  app.post("/api/garmin/connect", async (req, res) => {
    const parsed = garminConnectRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Petición inválida",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      return;
    }

    if (deps.isMockMode()) {
      res.status(409).json({
        error:
          "MOCK_MODE está activo. Pon MOCK_MODE=false en apps/server/.env y reinicia el backend antes de conectar Garmin.",
      });
      return;
    }

    const { email, password } = parsed.data;
    const candidate = deps.createCandidate(email, password);

    let result: { ok: true } | { ok: false; message: string };
    try {
      result = await withTimeout(
        candidate.verifyLogin(),
        timeoutMs,
        "Garmin no respondió a tiempo (puede que npx esté descargando el paquete la primera vez). Intenta de nuevo.",
      );
    } catch (error) {
      await candidate.disconnect().catch(() => {});
      res.status(502).json({ error: error instanceof Error ? error.message : "No se pudo conectar con Garmin" });
      return;
    }

    if (!result.ok) {
      await candidate.disconnect().catch(() => {});
      res.status(401).json({ error: result.message });
      return;
    }

    const previous = deps.getProvider();
    if (isConnectable(previous)) {
      await previous.disconnect().catch(() => {});
    }
    deps.setProvider(candidate);
    upsertEnvVars(deps.envFilePath, { GARMIN_EMAIL: email, GARMIN_PASSWORD: password });

    res.json({ connected: true });
  });

  app.post("/api/garmin/disconnect", async (_req, res) => {
    const current = deps.getProvider();
    if (isConnectable(current)) {
      await current.disconnect().catch(() => {});
    }
    deps.setProvider(new MockGarminDataProvider());
    removeEnvVars(deps.envFilePath, ["GARMIN_EMAIL", "GARMIN_PASSWORD"]);
    res.json({ connected: false });
  });
}
