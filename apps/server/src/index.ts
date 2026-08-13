import path from "node:path";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import {
  assessPerformance,
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
import { seedGarminTokenCacheFromEnv } from "./garmin/token-seed";
import { newMessageId } from "./agent/gateway";
import { getMemoryDb } from "./memory/db";
import { buildMemoryContext } from "./memory/context";
import { embedText } from "./memory/embeddings";
import { MemoryRepository } from "./memory/repository";
import { summarizeIfDue, type SummarizingAgentGateway } from "./memory/summarizer";

/**
 * Backend de RideLab Coach.
 *
 * Es el único que ve secretos: la app móvil sólo conoce la URL de este servidor.
 * Ninguna respuesta incluye claves, tokens ni credenciales.
 */

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Antes de crear el proveedor: si hay tokens ya autenticados en variables de
// entorno, quedan en ~/.garmin-mcp/ para que el primer login no sea nuevo.
seedGarminTokenCacheFromEnv();

// `let`, no `const`: un login exitoso desde la app reemplaza este proveedor
// en caliente, sin reiniciar el backend.
let garminProvider: GarminDataProvider = createGarminProvider();
// Resolver indirecto (no `garminProvider.getHistoricalMetrics` directo): así
// sigue al proveedor vigente si `setProvider` lo reemplaza tras un login.
const agentGateway = createAgentGateway((params) => garminProvider.getHistoricalMetrics(params));

// Sin `MEMORY_ENCRYPTION_KEY` la memoria persistente queda deshabilitada (no
// falla el arranque, ver config.ts): `/api/chat` sigue funcionando, sólo sin
// recordar entre sesiones.
const memoryRepository = config.memory.encryptionKey ? new MemoryRepository(getMemoryDb()) : undefined;
// Cliente aparte para embeddings: no vale la pena exponer el que ya usa
// `OpenAIAgentGateway` internamente sólo para esto.
const embeddingsClient = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : undefined;
// El resumen periódico (Fase 7) sólo corre si hay memoria habilitada, un
// cliente de embeddings, y el gateway activo sabe resumir — sólo
// `OpenAIAgentGateway` lo implementa; en modo demo no hay con qué resumir.
const memorySummarizer: SummarizingAgentGateway | undefined =
  memoryRepository && embeddingsClient && agentGateway.summarizeMemory
    ? { summarizeMemory: (previousSummary, newMessages) => agentGateway.summarizeMemory!(previousSummary, newMessages) }
    : undefined;

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

/**
 * Serie temporal de FC de una actividad puntual, para cruzarla contra los
 * intervalos reales de cada ejercicio (Rendimiento por sesión). La app sólo
 * la pide para actividades ya confirmadas como vinculadas a una sesión — el
 * backend no conoce el concepto de "match" (vive sólo en el móvil), así que
 * no hay nada que validar acá aparte del id.
 */
app.get("/api/garmin/activity-details/:activityId", async (req, res) => {
  const { activityId } = req.params;
  if (!activityId) {
    res.status(400).json({ error: "activityId es obligatorio" });
    return;
  }

  try {
    const timeSeries = await garminProvider.getActivityDetails(activityId);
    res.json(timeSeries);
  } catch (error) {
    res.status(502).json({
      error: "No se pudo obtener el detalle de la actividad",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Snapshot + assessment + guidance para la sección Estado, en una sola vuelta.
 * El error de una parte no descarta lo que sí funcionó: si `getPerformanceSnapshot`
 * falla, no hay nada que evaluar y se responde 502; si el snapshot llega pero
 * el agente falla al redactar, `generateGuidance` ya resuelve con su propio
 * fallback determinístico internamente, así que nunca llega vacío hasta acá.
 */
app.get("/api/garmin/performance", async (req, res) => {
  try {
    const subjectiveNote = typeof req.query.note === "string" ? req.query.note.slice(0, 500) : undefined;
    const snapshot = await garminProvider.getPerformanceSnapshot();
    const assessment = assessPerformance(snapshot);
    const guidance = await agentGateway.generateGuidance(assessment, snapshot, subjectiveNote);
    res.json({ snapshot, assessment, guidance });
  } catch (error) {
    console.error("[performance] error:", error);
    res.status(502).json({
      error: "No se pudo actualizar tu estado en este momento",
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

  // Se persiste apenas se valida la petición, antes de llamar al agente: si
  // el agente falla después, el turno del usuario no se pierde igual.
  const lastUserMessage = [...parsed.data.messages].reverse().find((m) => m.role === "user");
  if (memoryRepository && lastUserMessage) {
    memoryRepository.saveChatMessage({
      id: newMessageId(),
      role: "user",
      content: lastUserMessage.content,
      createdAt: new Date().toISOString(),
    });
  }

  try {
    const snapshot = await garminProvider.getSnapshot();
    const memoryContext =
      memoryRepository && lastUserMessage
        ? await buildMemoryContext(memoryRepository, lastUserMessage.content, {
            embedQuery: embeddingsClient ? (text) => embedText(text, embeddingsClient) : undefined,
          })
        : undefined;
    const message = await agentGateway.reply(parsed.data, snapshot, memoryContext);

    if (memoryRepository) {
      memoryRepository.saveChatMessage({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        dataSources: message.dataSources,
        suggestedActions: message.suggestedActions,
      });
    }

    // Fire-and-forget: nunca bloquea la respuesta al usuario. Sólo corre si
    // hace falta (gating de 7 días / 24h dentro de `summarizeIfDue`).
    if (memoryRepository && memorySummarizer && embeddingsClient) {
      const client = embeddingsClient;
      void summarizeIfDue(memoryRepository, memorySummarizer, (text) => embedText(text, client)).catch((error) => {
        console.error("[memory] summarizeIfDue lanzó un error inesperado:", error);
      });
    }

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
