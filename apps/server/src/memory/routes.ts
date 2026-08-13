import type { Express } from "express";
import { DEFAULT_USER_ID, type MemoryRepository } from "./repository";

/**
 * Borrado de la memoria persistente (mensajes, resúmenes y fragmentos).
 *
 * Extraída de `index.ts` (mismo motivo que `garmin/auth-routes.ts`): así se
 * puede probar contra un `express()` real, sin levantar el resto del backend.
 */
export function registerMemoryRoutes(app: Express, deps: { repository?: MemoryRepository; userId?: string }): void {
  /** Irreversible. Sin memoria habilitada (`MEMORY_ENCRYPTION_KEY` ausente), no hay nada que borrar. */
  app.delete("/api/memory", (_req, res) => {
    if (!deps.repository) {
      res.json({ cleared: false, reason: "La memoria persistente no está habilitada en este backend" });
      return;
    }
    deps.repository.clearUserData(deps.userId ?? DEFAULT_USER_ID);
    res.json({ cleared: true });
  });
}
