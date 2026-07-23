import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AiSettings } from "./types.js";

const DEFAULT_DESTINATIONS = ["Documents", "Images", "Audio", "Video", "Archives", "Code & Data", "Other"];
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function defaultAiSettingsPath(): string {
  return path.join(os.homedir(), ".inboxfs", "ai-settings.json");
}

export function defaultAiSettings(): AiSettings {
  return { enabled: false, model: "", includeText: false, destinations: [...DEFAULT_DESTINATIONS] };
}

export function safeDestination(value: unknown, field = "destinations"): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
    throw new Error(`${field} must contain visible folder names up to 100 characters.`);
  }
  const destination = value.trim();
  if (destination === "." || destination === ".." || destination.startsWith(".") || destination.endsWith(".") || destination.endsWith(" ") || /[\\/<>:"|?*\u0000-\u001f]/.test(destination) || WINDOWS_RESERVED.test(destination)) {
    throw new Error(`${field} must contain safe, visible folder names without path separators.`);
  }
  return destination;
}

export function isLocalModelName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100 && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value) && !/(^|[:_/-])cloud($|[:_/-])/i.test(value);
}

export function parseAiSettings(input: unknown): AiSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("AI settings must be an object.");
  const value = input as Record<string, unknown>;
  const unsupported = Object.keys(value).find((key) => !["enabled", "model", "includeText", "destinations"].includes(key));
  if (unsupported) throw new Error(`AI settings contain unsupported field "${unsupported}".`);
  if (typeof value.enabled !== "boolean" || typeof value.includeText !== "boolean") throw new Error("AI settings require boolean enabled and includeText values.");
  if (typeof value.model !== "string" || value.model.length > 100 || (value.enabled && !isLocalModelName(value.model))) throw new Error("Select a valid local model before enabling AI review.");
  if (!Array.isArray(value.destinations) || value.destinations.length < 2 || value.destinations.length > 20) throw new Error("AI settings require 2 to 20 destination folders.");
  const destinations = value.destinations.map((item) => safeDestination(item));
  if (new Set(destinations.map((item) => item.toLowerCase())).size !== destinations.length) throw new Error("AI destination folders must be unique.");
  return { enabled: value.enabled, model: value.model, includeText: value.includeText, destinations };
}

export async function readAiSettings(settingsPath = defaultAiSettingsPath()): Promise<AiSettings> {
  try {
    const metadata = await lstat(settingsPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("AI settings must be a regular file.");
    if (metadata.size > 16 * 1024) throw new Error("AI settings must be 16 KB or smaller.");
    return parseAiSettings(JSON.parse(await readFile(settingsPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultAiSettings();
    if (error instanceof SyntaxError) throw new Error("AI settings contain invalid JSON.");
    throw error;
  }
}

export async function writeAiSettings(input: unknown, settingsPath = defaultAiSettingsPath()): Promise<AiSettings> {
  const settings = parseAiSettings(input);
  await mkdir(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
  const parent = await realpath(path.dirname(settingsPath));
  const target = path.join(parent, path.basename(settingsPath));
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("AI settings must be a regular file.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = path.join(parent, `.ai-settings.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return settings;
}
