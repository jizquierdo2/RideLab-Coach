import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { upsertEnvVars, removeEnvVars } from "./env-file";

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ridelab-env-"));
  filePath = path.join(dir, ".env");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("upsertEnvVars", () => {
  it("crea el archivo y agrega las claves cuando no existe", () => {
    upsertEnvVars(filePath, { GARMIN_EMAIL: "a@b.com", GARMIN_PASSWORD: "secreta" });
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    expect(parsed.GARMIN_EMAIL).toBe("a@b.com");
    expect(parsed.GARMIN_PASSWORD).toBe("secreta");
  });

  it("reemplaza en el lugar preservando otras líneas y comentarios", () => {
    fs.writeFileSync(
      filePath,
      ["# comentario", "PORT=8787", "GARMIN_EMAIL=old@b.com", "MOCK_MODE=false"].join("\n"),
    );

    upsertEnvVars(filePath, { GARMIN_EMAIL: "new@b.com" });

    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    expect(lines).toEqual(["# comentario", "PORT=8787", "GARMIN_EMAIL='new@b.com'", "MOCK_MODE=false"]);
  });

  it("no toca una clave que sólo aparece dentro de un comentario", () => {
    fs.writeFileSync(filePath, "# GARMIN_EMAIL=comentada\nPORT=8787");
    upsertEnvVars(filePath, { GARMIN_EMAIL: "real@b.com" });

    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    expect(lines[0]).toBe("# GARMIN_EMAIL=comentada");
    expect(lines).toContain("GARMIN_EMAIL='real@b.com'");
  });

  it("hace roundtrip exacto para un valor que trae comilla simple y doble a la vez", () => {
    const tricky = `p'a"s\\s w0rd`;
    upsertEnvVars(filePath, { GARMIN_PASSWORD: tricky });
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    expect(parsed.GARMIN_PASSWORD).toBe(tricky);
  });

  it("hace roundtrip para un valor que sólo trae comilla simple", () => {
    const tricky = `it's-a-password`;
    upsertEnvVars(filePath, { GARMIN_PASSWORD: tricky });
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    expect(parsed.GARMIN_PASSWORD).toBe(tricky);
  });

  it("hace roundtrip para un valor con espacios simples", () => {
    upsertEnvVars(filePath, { GARMIN_PASSWORD: "una clave con espacios" });
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    expect(parsed.GARMIN_PASSWORD).toBe("una clave con espacios");
  });
});

describe("removeEnvVars", () => {
  it("borra sólo las claves pedidas", () => {
    fs.writeFileSync(filePath, ["PORT=8787", "GARMIN_EMAIL=a@b.com", "GARMIN_PASSWORD=x"].join("\n"));
    removeEnvVars(filePath, ["GARMIN_EMAIL", "GARMIN_PASSWORD"]);

    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    expect(lines).toEqual(["PORT=8787"]);
  });

  it("no falla si la clave no existe", () => {
    fs.writeFileSync(filePath, "PORT=8787");
    expect(() => removeEnvVars(filePath, ["GARMIN_EMAIL"])).not.toThrow();
    expect(fs.readFileSync(filePath, "utf8")).toBe("PORT=8787");
  });

  it("no falla si el archivo no existe", () => {
    expect(() => removeEnvVars(filePath, ["GARMIN_EMAIL"])).not.toThrow();
  });
});
