import { readFile, writeFile } from "node:fs/promises";
import type { JsonValue } from "./types.js";

export async function readJsonFile(path: string): Promise<JsonValue> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as JsonValue;
}

export async function writeJsonFile(path: string, json: JsonValue): Promise<void> {
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  await writeFile(path, text, "utf8");
}
