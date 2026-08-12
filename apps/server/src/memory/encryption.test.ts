import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { decrypt, encrypt, MissingEncryptionKeyError } from "./encryption";

const KEY = crypto.randomBytes(32).toString("base64");

describe("encrypt/decrypt", () => {
  it("descifra exactamente lo que se cifró", () => {
    const plaintext = "¿Cómo estuvo mi entrenamiento ayer? RPE 7, dolor rodilla derecha.";
    const ciphertext = encrypt(plaintext, KEY);
    expect(decrypt(ciphertext, KEY)).toBe(plaintext);
  });

  it("el texto cifrado nunca contiene el texto plano", () => {
    const plaintext = "información sensible del usuario";
    const ciphertext = encrypt(plaintext, KEY);
    expect(ciphertext).not.toContain(plaintext);
  });

  it("dos cifrados del mismo texto son distintos (IV aleatorio)", () => {
    const plaintext = "mismo mensaje";
    expect(encrypt(plaintext, KEY)).not.toBe(encrypt(plaintext, KEY));
  });

  it("falla explícitamente sin MEMORY_ENCRYPTION_KEY, en vez de guardar sin cifrar", () => {
    expect(() => encrypt("texto", "")).toThrow(MissingEncryptionKeyError);
    expect(() => decrypt("a:b:c", "")).toThrow(MissingEncryptionKeyError);
  });

  it("rechaza una clave que no decodifica a 32 bytes", () => {
    expect(() => encrypt("texto", Buffer.from("corta").toString("base64"))).toThrow(/32 bytes/);
  });

  it("falla al descifrar con una clave distinta a la usada para cifrar", () => {
    const ciphertext = encrypt("texto", KEY);
    const otherKey = crypto.randomBytes(32).toString("base64");
    expect(() => decrypt(ciphertext, otherKey)).toThrow();
  });
});
