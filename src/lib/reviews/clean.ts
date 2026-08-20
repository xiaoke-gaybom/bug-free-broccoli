import type { CleanReview, RawReview } from "../types";

/**
 * Deterministic review cleaning, de-duplication and normalization.
 *
 * This stage is intentionally rule-based (no LLM) for the reasons stated in
 * the assignment: data collection, de-duplication, field normalization,
 * validation and safety checks are appropriate places for deterministic rules.
 * Semantic tasks (topic discovery, issue consolidation, requirement/test
 * generation) live in the LLM layer instead.
 */

const EMPTY_RE = /^\s*$/;

export interface CleanResult {
  clean: CleanReview[];
  /** Reviews dropped because they were empty. */
  droppedEmpty: number;
  /** Reviews dropped because they were near-duplicates. */
  droppedDuplicate: number;
  /** Reviews flagged for low-content (very short / single-emoji). */
  flaggedLowContent: number;
  /** Reviews flagged with profanity. */
  flaggedProfanity: number;
  /** Total raw input count. */
  rawCount: number;
}

const PROFANITY_BLOCKLIST = [
  "fuck", "shit", "bitch", "asshole", "cunt", "dick", "piss",
  // Keep the list short and obvious — only used to flag, not censor.
];

export function cleanReviews(raw: RawReview[]): CleanResult {
  const seen = new Set<string>();
  const clean: CleanReview[] = [];
  let droppedEmpty = 0;
  let droppedDuplicate = 0;
  let flaggedLowContent = 0;
  let flaggedProfanity = 0;

  for (const r of raw) {
    const title = (r.title ?? "").trim();
    const content = (r.content ?? "").trim();
    const joined = `${title} ${content}`.trim();
    if (EMPTY_RE.test(joined)) {
      droppedEmpty++;
      continue;
    }

    const fingerprint = dedupFingerprint(joined);
    if (seen.has(fingerprint)) {
      droppedDuplicate++;
      continue;
    }
    seen.add(fingerprint);

    const flags: string[] = [];
    const tokenCount = countTokens(joined);
    if (tokenCount < 3) {
      flags.push("low-content");
      flaggedLowContent++;
    }
    const lower = joined.toLowerCase();
    if (PROFANITY_BLOCKLIST.some((w) => lower.includes(w))) {
      flags.push("profanity");
      flaggedProfanity++;
    }
    if (r.rating < 1 || r.rating > 5) flags.push("bad-rating");
    const versionClean = r.version?.trim() || undefined;
    if (!r.isoDate || !isValidIsoDate(r.isoDate)) flags.push("bad-date");

    clean.push({
      id: r.id,
      externalId: r.externalId,
      author: (r.author ?? "anonymous").trim() || "anonymous",
      rating: clampRating(r.rating),
      title,
      content,
      contentLen: content.length,
      version: versionClean,
      isoDate: r.isoDate,
      url: r.url,
      source: r.source,
      tokenCount,
      flags,
    });
  }

  return {
    clean,
    droppedEmpty,
    droppedDuplicate,
    flaggedLowContent,
    flaggedProfanity,
    rawCount: raw.length,
  };
}

/**
 * Apply an analysis goal as a deterministic filter (e.g. restrict to a
 * version, or to low scores). Returns the filtered subset plus excluded count.
 */
export function applyGoalFilter(
  clean: CleanReview[],
  goal: { appVersion?: string; maxRating?: number },
): { filtered: CleanReview[]; excluded: number } {
  let excluded = 0;
  const filtered = clean.filter((r) => {
    if (goal.appVersion && r.version && r.version !== goal.appVersion) {
      excluded++;
      return false;
    }
    if (typeof goal.maxRating === "number" && r.rating > goal.maxRating) {
      excluded++;
      return false;
    }
    return true;
  });
  return { filtered, excluded };
}

function dedupFingerprint(text: string): string {
  // Normalize whitespace + lowercase, drop trailing punctuation.
  const norm = text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.!?,;:]+$/g, "")
    .slice(0, 500);
  return norm;
}

function countTokens(text: string): number {
  // Cheap whitespace tokenization — only used for low-content flagging.
  return text.split(/\s+/).filter(Boolean).length;
}

function clampRating(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return Math.min(5, Math.max(0, Math.round(r)));
}

function isValidIsoDate(s: string): boolean {
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

/** Build a rating distribution object from a set of reviews. */
export function ratingDistribution(reviews: { rating: number }[]): Record<string, number> {
  const dist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of reviews) {
    const k = String(clampRating(r.rating));
    dist[k] = (dist[k] ?? 0) + 1;
  }
  return dist;
}

/** Average rating helper. */
export function avgRating(reviews: { rating: number }[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
}
