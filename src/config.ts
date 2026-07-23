import { lstat, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export interface RuleDocument {
  name: string;
  destination: string;
  extensions: string[];
}

export interface ConfigDocument {
  version: 1;
  rules: RuleDocument[];
}

export interface CustomRule {
  name: string;
  destination: string;
  extensions: Set<string>;
}

export interface InboxConfig {
  rules: CustomRule[];
  source?: string;
}

export const CONFIG_NAME = ".inboxfs.json";
const MAX_CONFIG_BYTES = 64 * 1024;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${CONFIG_NAME}: ${field} must be a non-empty string up to ${maximum} characters.`);
  }
  return value.trim();
}

function destinationName(value: unknown, index: number): string {
  const destination = text(value, `rules[${index}].destination`, 100);
  if (destination === "." || destination === ".." || destination.startsWith(".") || destination.endsWith(".") || destination.endsWith(" ") || /[\\/<>:"|?*\u0000-\u001f]/.test(destination) || WINDOWS_RESERVED.test(destination)) {
    throw new Error(`${CONFIG_NAME}: rules[${index}].destination must be a safe, visible folder name without path separators.`);
  }
  return destination;
}

function extensionName(value: unknown, index: number): string {
  if (typeof value !== "string") throw new Error(`${CONFIG_NAME}: rules[${index}].extensions must contain strings.`);
  const extension = value.trim().toLowerCase().replace(/^\./, "");
  if (!/^[a-z0-9][a-z0-9+_-]{0,19}$/.test(extension)) {
    throw new Error(`${CONFIG_NAME}: "${value}" is not a supported extension.`);
  }
  return extension;
}

export function parseInboxConfig(input: unknown, source?: string): InboxConfig {
  if (!object(input) || input.version !== 1 || !Array.isArray(input.rules)) {
    throw new Error(`${CONFIG_NAME} must contain { "version": 1, "rules": [...] }.`);
  }
  if (input.rules.length > 100) throw new Error(`${CONFIG_NAME} supports at most 100 rules.`);

  const extensions = new Map<string, string>();
  const names = new Set<string>();
  const rules = input.rules.map((value, index): CustomRule => {
    if (!object(value)) throw new Error(`${CONFIG_NAME}: rules[${index}] must be an object.`);
    const name = text(value.name, `rules[${index}].name`, 80);
    if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error(`${CONFIG_NAME}: rules[${index}].name cannot contain control characters.`);
    const destination = destinationName(value.destination, index);
    if (names.has(name.toLowerCase())) throw new Error(`${CONFIG_NAME}: rule name "${name}" is duplicated.`);
    names.add(name.toLowerCase());
    if (!Array.isArray(value.extensions) || !value.extensions.length || value.extensions.length > 50) {
      throw new Error(`${CONFIG_NAME}: rules[${index}].extensions must contain 1 to 50 extensions.`);
    }
    const normalized = new Set(value.extensions.map((extension) => extensionName(extension, index)));
    for (const extension of normalized) {
      const owner = extensions.get(extension);
      if (owner) throw new Error(`${CONFIG_NAME}: .${extension} is assigned to both "${owner}" and "${name}".`);
      extensions.set(extension, name);
    }
    return { name, destination, extensions: normalized };
  });

  return { rules, source };
}

export function configDocument(config: InboxConfig): ConfigDocument {
  return {
    version: 1,
    rules: config.rules.map((rule) => ({
      name: rule.name,
      destination: rule.destination,
      extensions: [...rule.extensions],
    })),
  };
}

export async function readInboxConfig(root: string): Promise<InboxConfig> {
  const configPath = path.join(root, CONFIG_NAME);
  let contents: string;
  try {
    const metadata = await lstat(configPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${CONFIG_NAME} must be a regular file.`);
    if (metadata.size > MAX_CONFIG_BYTES) throw new Error(`${CONFIG_NAME} must be 64 KB or smaller.`);
    contents = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rules: [] };
    throw error;
  }

  let input: unknown;
  try { input = JSON.parse(contents); } catch { throw new Error(`${CONFIG_NAME} contains invalid JSON.`); }
  return parseInboxConfig(input, CONFIG_NAME);
}

export async function writeInboxConfig(root: string, input: unknown): Promise<InboxConfig> {
  const canonicalRoot = await realpath(root);
  const configPath = path.join(canonicalRoot, CONFIG_NAME);
  const config = parseInboxConfig(input, CONFIG_NAME);
  const contents = `${JSON.stringify(configDocument(config), null, 2)}\n`;
  if (Buffer.byteLength(contents) > MAX_CONFIG_BYTES) throw new Error(`${CONFIG_NAME} must be 64 KB or smaller.`);

  try {
    const metadata = await lstat(configPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${CONFIG_NAME} must be a regular file.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporaryPath = path.join(canonicalRoot, `${CONFIG_NAME}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporaryPath, configPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return config;
}
