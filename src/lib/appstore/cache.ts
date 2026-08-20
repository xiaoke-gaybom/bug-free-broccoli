import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Deterministic file-based cache layer.
 *
 * Used to satisfy the assignment requirement: "provide necessary sample output
 * or cached data so interviewers can view results even when external network
 * access is unavailable". Cached data is clearly marked via `dataProvenance`
 * in the final result and never replaces fresh-processing capability when
 * network + model are available.
 */

const DEFAULT_CACHE_ROOT = path.join(process.cwd(), "data", "cache");

function cacheRoot(): string {
  return process.env.REVIEW_FORGE_CACHE_DIR?.trim() || DEFAULT_CACHE_ROOT;
}

export function isCacheDisabled(): boolean {
  return process.env.REVIEW_FORGE_NO_CACHE === "1";
}

function safeKey(key: string): string {
  // Only allow alphanumerics, dash, underscore, dot, colon.
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function readCache<T>(
  namespace: string,
  key: string,
): Promise<T | null> {
  if (isCacheDisabled()) return null;
  try {
    const file = path.join(cacheRoot(), namespace, `${safeKey(key)}.json`);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    // Don't throw on cache errors — degrade gracefully.
    return null;
  }
}

export async function writeCache<T>(
  namespace: string,
  key: string,
  value: T,
): Promise<void> {
  try {
    const dir = path.join(cacheRoot(), namespace);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${safeKey(key)}.json`);
    await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  } catch {
    // Best-effort cache; never block the pipeline on cache write failure.
  }
}

/** Read a committed sample dataset (shipped with the repo for offline runs). */
export async function readSample<T>(samplePath: string): Promise<T | null> {
  try {
    const abs = path.isAbsolute(samplePath)
      ? samplePath
      : path.join(process.cwd(), samplePath);
    const raw = await fs.readFile(abs, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
