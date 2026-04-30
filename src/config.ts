import type { DeidConfig, DeidMode, JsonValue } from "./types.js";
import { readJsonFile } from "./io.js";

const isStringArray = (value: JsonValue | undefined): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export async function readConfig(path: string | undefined): Promise<DeidConfig> {
  if (!path) {
    return {};
  }

  const json = await readJsonFile(path);
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("config must be a JSON object");
  }

  const config = json as Record<string, JsonValue>;
  const mode = config.mode;
  if (mode !== undefined && mode !== "default" && mode !== "strict-safe-harbor") {
    throw new Error("config.mode must be default or strict-safe-harbor");
  }

  if (config.ignoreRules !== undefined && !isStringArray(config.ignoreRules)) {
    throw new Error("config.ignoreRules must be an array of strings");
  }

  if (config.ignorePaths !== undefined && !isStringArray(config.ignorePaths)) {
    throw new Error("config.ignorePaths must be an array of strings");
  }

  if (config.cmsReport !== undefined && typeof config.cmsReport !== "boolean") {
    throw new Error("config.cmsReport must be a boolean");
  }

  return {
    cmsReport: config.cmsReport as boolean | undefined,
    ignorePaths: config.ignorePaths as string[] | undefined,
    ignoreRules: config.ignoreRules as string[] | undefined,
    mode: mode as DeidMode | undefined
  };
}

export function mergeConfig(config: DeidConfig, overrides: DeidConfig): DeidConfig {
  return {
    cmsReport: overrides.cmsReport ?? config.cmsReport,
    ignorePaths: overrides.ignorePaths ?? config.ignorePaths,
    ignoreRules: overrides.ignoreRules ?? config.ignoreRules,
    mode: overrides.mode ?? config.mode
  };
}
