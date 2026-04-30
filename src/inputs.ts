import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export interface InputFile {
  path: string;
  relativePath: string;
}

const ignoredDirs = new Set([".git", "node_modules", "dist"]);

const hasGlob = (input: string): boolean => /[*?\[]/.test(input);

const escapeRegex = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, "\\$&");

function globToRegex(pattern: string): RegExp {
  const normalized = pattern.split(sep).join("/");
  let regex = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      regex += ".*";
      index += 1;
    } else if (char === "*") {
      regex += "[^/]*";
    } else if (char === "?") {
      regex += "[^/]";
    } else {
      regex += escapeRegex(char);
    }
  }
  return new RegExp(`${regex}$`);
}

async function walkJsonFiles(root: string, base = root): Promise<InputFile[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: InputFile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) {
      continue;
    }

    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonFiles(fullPath, base)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push({
        path: fullPath,
        relativePath: relative(base, fullPath) || basename(fullPath)
      });
    }
  }

  return files;
}

function globBase(pattern: string): string {
  const firstGlob = pattern.search(/[*?\[]/);
  if (firstGlob === -1) {
    return dirname(pattern);
  }
  const prefix = pattern.slice(0, firstGlob);
  const separator = prefix.lastIndexOf(sep);
  if (separator === -1) {
    return process.cwd();
  }
  const base = prefix.slice(0, separator);
  return base || sep;
}

export async function resolveInputFiles(inputs: string[]): Promise<InputFile[]> {
  const files: InputFile[] = [];

  for (const input of inputs) {
    if (hasGlob(input)) {
      const absolutePattern = resolve(input);
      const base = globBase(absolutePattern);
      const matcher = globToRegex(absolutePattern.split(sep).join("/"));
      const matches = (await walkJsonFiles(base, base)).filter((file) => matcher.test(file.path.split(sep).join("/")));
      files.push(...matches);
      continue;
    }

    const fullPath = resolve(input);
    const details = await stat(fullPath);
    if (details.isDirectory()) {
      files.push(...(await walkJsonFiles(fullPath, fullPath)));
    } else if (details.isFile()) {
      files.push({ path: fullPath, relativePath: basename(fullPath) });
    }
  }

  const unique = new Map<string, InputFile>();
  for (const file of files) {
    unique.set(file.path, file);
  }
  const resolved = [...unique.values()].sort((a, b) => a.path.localeCompare(b.path));
  if (resolved.length === 0) {
    throw new Error(`No JSON input files matched: ${inputs.join(", ")}`);
  }
  return resolved;
}

export function outputPathFor(input: InputFile, out: string, multiple: boolean): string {
  return multiple ? join(out, input.relativePath) : out;
}
