import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LegacyRuleDocument {
  name: string;
  destination: string;
  extensions: string[];
}

export interface LegacyConfigDocument {
  version: 1;
  rules: LegacyRuleDocument[];
}

export interface SizeRangeDocument {
  minBytes?: number;
  maxBytes?: number;
}

export interface RuleMatchDocument {
  extensions?: string[];
  nameGlobs?: string[];
  size?: SizeRangeDocument;
}

export interface RuleDocument {
  name: string;
  destination: string;
  enabled: boolean;
  match: RuleMatchDocument;
}

export interface ConfigDocument {
  version: 2;
  rules: RuleDocument[];
}

export interface CustomRule {
  name: string;
  destination: string;
  enabled: boolean;
  extensions: Set<string>;
  nameGlobs: string[];
  minBytes?: number;
  maxBytes?: number;
}

export interface InboxConfig {
  version: 2;
  rules: CustomRule[];
  source?: string;
  migratedFromVersion?: 1;
}

export const CONFIG_NAME = ".inboxfs.json";
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_RULES = 100;
const MAX_EXTENSIONS = 50;
const MAX_GLOBS = 20;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function supportedFields(value: Record<string, unknown>, allowed: string[], field: string) {
  const unsupported = Object.keys(value).find((key) => !allowed.includes(key));
  if (unsupported) throw new Error(`${CONFIG_NAME}: ${field} contains unsupported field "${unsupported}".`);
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
  if (typeof value !== "string") throw new Error(`${CONFIG_NAME}: rules[${index}].match.extensions must contain strings.`);
  const extension = value.trim().toLowerCase().replace(/^\./, "");
  if (!/^[a-z0-9][a-z0-9+_-]{0,19}$/.test(extension)) {
    throw new Error(`${CONFIG_NAME}: "${value}" is not a supported extension.`);
  }
  return extension;
}

function globName(value: unknown, index: number): string {
  if (typeof value !== "string") throw new Error(`${CONFIG_NAME}: rules[${index}].match.nameGlobs must contain strings.`);
  const glob = value.trim();
  if (!glob || glob.length > 100 || /[\\/\u0000-\u001f\u007f]/.test(glob) || glob.includes("**")) {
    throw new Error(`${CONFIG_NAME}: "${value}" is not a supported file name glob. Use up to 100 characters with single * and ? wildcards and no path separators.`);
  }
  return glob;
}

function stringList(value: unknown, field: string, maximum: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${CONFIG_NAME}: ${field} must contain at most ${maximum} values.`);
  }
  return value;
}

function byteLimit(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${CONFIG_NAME}: ${field} must be a non-negative integer number of bytes.`);
  }
  return value;
}

function commonRule(value: Record<string, unknown>, index: number, names: Set<string>) {
  const name = text(value.name, `rules[${index}].name`, 80);
  if (/\p{Cc}/u.test(name)) throw new Error(`${CONFIG_NAME}: rules[${index}].name cannot contain control characters.`);
  const key = name.toLowerCase();
  if (names.has(key)) throw new Error(`${CONFIG_NAME}: rule name "${name}" is duplicated.`);
  names.add(key);
  return { name, destination: destinationName(value.destination, index) };
}

function parseLegacy(input: Record<string, unknown>, source?: string): InboxConfig {
  supportedFields(input, ["version", "rules"], "document");
  if (!Array.isArray(input.rules)) throw new Error(`${CONFIG_NAME} must contain { "version": 1, "rules": [...] }.`);
  if (input.rules.length > MAX_RULES) throw new Error(`${CONFIG_NAME} supports at most ${MAX_RULES} rules.`);
  const owners = new Map<string, string>();
  const names = new Set<string>();
  const rules = input.rules.map((value, index): CustomRule => {
    if (!object(value)) throw new Error(`${CONFIG_NAME}: rules[${index}] must be an object.`);
    supportedFields(value, ["name", "destination", "extensions"], `rules[${index}]`);
    const common = commonRule(value, index, names);
    if (!Array.isArray(value.extensions) || !value.extensions.length || value.extensions.length > MAX_EXTENSIONS) {
      throw new Error(`${CONFIG_NAME}: rules[${index}].extensions must contain 1 to ${MAX_EXTENSIONS} extensions.`);
    }
    const extensions = new Set(value.extensions.map((extension) => extensionName(extension, index)));
    for (const extension of extensions) {
      const owner = owners.get(extension);
      if (owner) throw new Error(`${CONFIG_NAME}: .${extension} is assigned to both "${owner}" and "${common.name}".`);
      owners.set(extension, common.name);
    }
    return { ...common, enabled: true, extensions, nameGlobs: [] };
  });
  return { version: 2, rules, source, migratedFromVersion: 1 };
}

function parseVersionTwo(input: Record<string, unknown>, source?: string): InboxConfig {
  supportedFields(input, ["version", "rules"], "document");
  if (!Array.isArray(input.rules)) throw new Error(`${CONFIG_NAME} must contain { "version": 2, "rules": [...] }.`);
  if (input.rules.length > MAX_RULES) throw new Error(`${CONFIG_NAME} supports at most ${MAX_RULES} rules.`);
  const names = new Set<string>();
  const rules = input.rules.map((value, index): CustomRule => {
    if (!object(value)) throw new Error(`${CONFIG_NAME}: rules[${index}] must be an object.`);
    supportedFields(value, ["name", "destination", "enabled", "match"], `rules[${index}]`);
    const common = commonRule(value, index, names);
    if (typeof value.enabled !== "boolean") throw new Error(`${CONFIG_NAME}: rules[${index}].enabled must be true or false.`);
    if (!object(value.match)) throw new Error(`${CONFIG_NAME}: rules[${index}].match must be an object.`);
    supportedFields(value.match, ["extensions", "nameGlobs", "size"], `rules[${index}].match`);
    const extensions = new Set(stringList(value.match.extensions, `rules[${index}].match.extensions`, MAX_EXTENSIONS).map((item) => extensionName(item, index)));
    const nameGlobs = [...new Set(stringList(value.match.nameGlobs, `rules[${index}].match.nameGlobs`, MAX_GLOBS).map((item) => globName(item, index)))];
    let minBytes: number | undefined;
    let maxBytes: number | undefined;
    if (value.match.size !== undefined) {
      if (!object(value.match.size)) throw new Error(`${CONFIG_NAME}: rules[${index}].match.size must be an object.`);
      supportedFields(value.match.size, ["minBytes", "maxBytes"], `rules[${index}].match.size`);
      minBytes = byteLimit(value.match.size.minBytes, `rules[${index}].match.size.minBytes`);
      maxBytes = byteLimit(value.match.size.maxBytes, `rules[${index}].match.size.maxBytes`);
      if (minBytes === undefined && maxBytes === undefined) throw new Error(`${CONFIG_NAME}: rules[${index}].match.size must set minBytes or maxBytes.`);
      if (minBytes !== undefined && maxBytes !== undefined && minBytes > maxBytes) {
        throw new Error(`${CONFIG_NAME}: rules[${index}].match.size.minBytes cannot exceed maxBytes.`);
      }
    }
    if (!extensions.size && !nameGlobs.length && minBytes === undefined && maxBytes === undefined) {
      throw new Error(`${CONFIG_NAME}: rules[${index}].match must include extensions, nameGlobs, or a size range.`);
    }
    return { ...common, enabled: value.enabled, extensions, nameGlobs, minBytes, maxBytes };
  });
  return { version: 2, rules, source };
}

export function parseInboxConfig(input: unknown, source?: string): InboxConfig {
  if (!object(input)) throw new Error(`${CONFIG_NAME} must contain a versioned rule document.`);
  if (input.version === 1) return parseLegacy(input, source);
  if (input.version === 2) return parseVersionTwo(input, source);
  throw new Error(`${CONFIG_NAME} supports configuration versions 1 and 2.`);
}

export function configDocument(config: InboxConfig): ConfigDocument {
  return {
    version: 2,
    rules: config.rules.map((rule) => {
      const match: RuleMatchDocument = {};
      if (rule.extensions.size) match.extensions = [...rule.extensions];
      if (rule.nameGlobs.length) match.nameGlobs = [...rule.nameGlobs];
      if (rule.minBytes !== undefined || rule.maxBytes !== undefined) {
        match.size = {
          ...(rule.minBytes === undefined ? {} : { minBytes: rule.minBytes }),
          ...(rule.maxBytes === undefined ? {} : { maxBytes: rule.maxBytes }),
        };
      }
      return { name: rule.name, destination: rule.destination, enabled: rule.enabled, match };
    }),
  };
}

export function configFingerprint(config: InboxConfig): string {
  return createHash("sha256").update(JSON.stringify(configDocument(config))).digest("hex").slice(0, 16);
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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 2, rules: [] };
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
