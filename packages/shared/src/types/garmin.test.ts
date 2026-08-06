import { describe, expect, it } from "vitest";
import { deriveGarminStatus, DEMO_NOTICE, garminSnapshotSchema } from "./garmin";
import { buildDemoSnapshot } from "../demo/garmin";

const now = new Date("2026-08-04T12:00:00.000Z");

describe("deriveGarminStatus", () => {
  it("marca 'disconnected' cuando no hay snapshot", () => {
    expect(deriveGarminStatus(undefined, now).status).toBe("disconnected");
  });

  it("marca 'demo' y avisa cuando la fuente es mock, aunque el dato sea fresco", () => {
    const status = deriveGarminStatus(buildDemoSnapshot(now), now);
    expect(status.status).toBe("demo");
    expect(status.message).toBe(DEMO_NOTICE);
  });

  it("marca 'connected' con datos reales recientes", () => {
    const snapshot = {
      ...buildDemoSnapshot(now),
      dataSource: "garmin-mcp" as const,
      connected: true,
      lastSyncAt: new Date(now.getTime() - 3_600_000).toISOString(),
    };
    expect(deriveGarminStatus(snapshot, now).status).toBe("connected");
  });

  it("marca 'stale' cuando la última sincronización pasó de 24 horas", () => {
    const snapshot = {
      ...buildDemoSnapshot(now),
      dataSource: "garmin-mcp" as const,
      connected: true,
      lastSyncAt: new Date(now.getTime() - 30 * 3_600_000).toISOString(),
    };
    const status = deriveGarminStatus(snapshot, now);
    expect(status.status).toBe("stale");
    expect(status.message).toContain("desactualizados");
  });

  it("marca 'disconnected' cuando la fuente es real pero no hay conexión", () => {
    const snapshot = {
      ...buildDemoSnapshot(now),
      dataSource: "garmin-mcp" as const,
      connected: false,
    };
    expect(deriveGarminStatus(snapshot, now).status).toBe("disconnected");
  });
});

describe("snapshot demo", () => {
  it("cumple el schema", () => {
    expect(garminSnapshotSchema.safeParse(buildDemoSnapshot(now)).success).toBe(true);
  });

  it("declara siempre periodo y última sincronización", () => {
    const snapshot = buildDemoSnapshot(now);
    expect(snapshot.period).toBeTruthy();
    expect(snapshot.lastSyncAt).toBeTruthy();
  });

  it("lista métricas no disponibles en vez de inventarlas", () => {
    const snapshot = buildDemoSnapshot(now);
    expect(snapshot.unavailableMetrics.length).toBeGreaterThan(0);
    expect(snapshot.dataSource).toBe("mock");
  });
});
