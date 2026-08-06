import path from "node:path";
import express from "express";
import cors from "cors";
import {
  chatRequestSchema,
  deriveGarminStatus,
  EXERCISE_CATALOG,
  type ChatResponse,
} from "@ridelab/shared";
import { config } from "./config";
import { createAgentGateway, createGarminProvider, describeRuntime } from "./factory";
import type { GarminDataProvider } from "./garmin/provider";
import { McpGarminDataProvider } from "./garmin/mcp";
import { registerGarminAuthRoutes } from "./garmin/auth-routes";

/**
 * Backend de RideLab Coach.
 *
 * Es el único que ve secretos: la app móvil sólo conoce la URL de este servidor.
 * Ninguna respuesta incluye claves, tokens ni credenciales.
 */

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// `let`, no `const`: un login exitoso desde la app reemplaza este proveedor
// en caliente, sin reiniciar el backend.
let garminProvider: GarminDataProvider = createGarminProvider();
const agentGateway = createAgentGateway();

registerGarminAuthRoutes(app, {
  envFilePath: path.resolve(process.cwd(), ".env"),
  isMockMode: () => config.mockMode,
  getProvider: () => garminProvider,
  setProvider: (provider) => {
    garminProvider = provider;
  },
  createCandidate: (email, password) => new McpGarminDataProvider(email, password),
});

/** Diagnóstico: qué está corriendo de verdad y qué falta para datos reales. */
app.get("/api/health", async (_req, res) => {
  const runtime = describeRuntime(garminProvider, agentGateway);
  res.json({
    ok: true,
    ...runtime,
    garminReady: await garminProvider.isReady(),
  });
});

/** Catálogo de ejercicios, para que la app resuelva videos y técnica. */
app.get("/api/catalog", (_req, res) => {
  res.json({ exercises: EXERCISE_CATALOG });
});

/** Estado de Garmin para el encabezado del chat. */
app.get("/api/garmin/status", async (_req, res) => {
  try {
    const snapshot = await garminProvider.getSnapshot();
    res.json(deriveGarminStatus(snapshot));
  } catch (error) {
    res.status(503).json({
      status: "disconnected",
      dataSource: "mock",
      message: error instanceof Error ? error.message : "No se pudo leer Garmin",
    });
  }
});

/** Actividades Garmin del rango pedido, para el calendario. */
app.get("/api/garmin/activities", async (req, res) => {
  const startDate = String(req.query.startDate ?? "");
  const endDate = String(req.query.endDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    res.status(400).json({ error: "startDate y endDate son obligatorios, formato YYYY-MM-DD" });
    return;
  }

  try {
    const activities = await garminProvider.getActivities({ startDate, endDate });
    res.json({ activities });
  } catch (error) {
    res.status(502).json({
      error: "No se pudieron obtener las actividades de Garmin",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/** Un turno de conversación con el coach. */
app.post("/api/chat", async (req, res) => {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Petición inválida",
      details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    return;
  }

  try {
    const snapshot = await garminProvider.getSnapshot();
    const message = await agentGateway.reply(parsed.data, snapshot);

    const response: ChatResponse = {
      message,
      garminStatus: deriveGarminStatus(snapshot),
      snapshot,
    };
    res.json(response);
  } catch (error) {
    console.error("[chat] error:", error);
    res.status(502).json({
      error: "El coach no está disponible en este momento",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

export { app };

// Arranque sólo cuando se ejecuta directamente (los tests importan `app`).
if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, () => {
    const runtime = describeRuntime(garminProvider, agentGateway);
    console.log(`RideLab Coach backend en http://localhost:${config.port}`);
    console.log(`  modo:    ${runtime.mockMode ? "DEMO (datos simulados)" : "REAL"}`);
    console.log(`  garmin:  ${runtime.garminProvider}`);
    console.log(`  agente:  ${runtime.agentGateway}`);
    if (runtime.blockers.length) {
      console.log(`  pendiente para datos reales: ${runtime.blockers.join(", ")}`);
    }
  });
}
