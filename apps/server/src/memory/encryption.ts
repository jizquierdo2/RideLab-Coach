import crypto from "node:crypto";

/**
 * Cifrado en reposo (AES-256-GCM) para el contenido de mensajes y resúmenes
 * de la memoria conversacional — nunca se persiste texto de conversación sin
 * cifrar. `node:crypto` es suficiente para esto, no hace falta una librería
 * nueva.
 *
 * El resultado empaqueta `iv:authTag:ciphertext`, todo en base64, en un solo
 * string — así una sola columna TEXT alcanza para guardarlo.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("MEMORY_ENCRYPTION_KEY no está configurada — no se puede cifrar ni descifrar contenido de memoria.");
  }
}

function resolveKey(base64Key: string): Buffer {
  if (!base64Key) throw new MissingEncryptionKeyError();
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error(`MEMORY_ENCRYPTION_KEY debe decodificar a 32 bytes (AES-256) — tiene ${key.length}`);
  }
  return key;
}

export function encrypt(plaintext: string, base64Key: string): string {
  const key = resolveKey(base64Key);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(packed: string, base64Key: string): string {
  const key = resolveKey(base64Key);
  const [ivB64, authTagB64, ciphertextB64] = packed.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Contenido cifrado con formato inválido");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}
