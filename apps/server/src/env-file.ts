import fs from "node:fs";

/**
 * Lectura/escritura mínima de un archivo `.env` línea por línea.
 *
 * No es un parser de dotenv completo: sólo sabe reemplazar o borrar líneas
 * `KEY=valor` propias, preservando todo lo demás (comentarios, otras claves,
 * orden) intacto. Alcanza para persistir `GARMIN_EMAIL`/`GARMIN_PASSWORD` tras
 * un login exitoso, que es el único uso que le da este backend.
 */

/** Índice de la línea `KEY=...` no comentada, o -1 si no existe. */
function findKeyLine(lines: string[], key: string): number {
  const pattern = new RegExp(`^${key}=`);
  return lines.findIndex((line) => pattern.test(line.trimStart()) && !line.trimStart().startsWith("#"));
}

/**
 * Comilla un valor para que `dotenv` lo re-lea exactamente igual.
 *
 * `dotenv` no interpreta escapes dentro de comillas (ni `\"` ni `\\`; sólo
 * convierte `\n` literal en salto de línea, igual sin importar el tipo de
 * comilla) — así que no hay forma de "escapar" una comilla dentro de su mismo
 * tipo. La estrategia correcta es elegir, de los tres delimitadores que
 * soporta (`'`, `"`, `` ` ``), el primero que no aparezca en el valor.
 */
function quoteEnvValue(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("`")) return `\`${value}\``;
  // Caso extremo: el valor trae los tres delimitadores. No hay comillado
  // seguro posible con el parser de dotenv; se usa comillas dobles igual.
  return `"${value}"`;
}

function readLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  if (content === "") return [];
  return content.split("\n");
}

function writeLines(filePath: string, lines: string[]): void {
  fs.writeFileSync(filePath, lines.join("\n"));
}

/** Reemplaza (o agrega) cada `KEY=valor` en el archivo, sin tocar el resto. */
export function upsertEnvVars(filePath: string, updates: Record<string, string>): void {
  const lines = readLines(filePath);

  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${quoteEnvValue(value)}`;
    const index = findKeyLine(lines, key);
    if (index >= 0) {
      lines[index] = line;
    } else {
      lines.push(line);
    }
  }

  writeLines(filePath, lines);
}

/** Borra las líneas `KEY=...` indicadas. No-op si una clave no existe. */
export function removeEnvVars(filePath: string, keys: string[]): void {
  const lines = readLines(filePath);
  if (lines.length === 0) return;

  const keySet = new Set(keys);
  const filtered = lines.filter((line) => {
    const match = line.trimStart().match(/^([A-Z0-9_]+)=/i);
    if (!match || line.trimStart().startsWith("#")) return true;
    return !keySet.has(match[1]);
  });

  writeLines(filePath, filtered);
}
