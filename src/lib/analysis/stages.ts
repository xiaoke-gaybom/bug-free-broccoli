import type {
  AnalysisGoal,
  AnalysisResult,
  CleanReview,
  Finding,
  PipelineStage,
  RawReview,
  ReleasePlan,
  Requirement,
  TestCase,
  Topic,
} from "../types";
import { avgRating, ratingDistribution } from "../reviews/clean";

/**
 * Pipeline orchestration: deterministic stats + LLM semantic stages.
 *
 * Each stage mutates the shared `stages` array so the UI can render live
 * progress. LLM stages fail loudly (per the assignment: do not fabricate
 * data on failure) but the deterministic stages always run.
 */

export interface PipelineHooks {
  onStageUpdate?: (stage: PipelineStage) => void;
  /** Allows the caller (API route) to abort a long-running pipeline. */
  signal?: AbortSignal;
}

export function makeStage(id: string, label: string): PipelineStage {
  return { id, label, status: "pending" };
}

export function startStage(stage: PipelineStage): void {
  stage.status = "running";
  stage.startedAt = new Date().toISOString();
}

export function finishStage(
  stage: PipelineStage,
  count?: number,
  note?: string,
): void {
  stage.status = "done";
  stage.finishedAt = new Date().toISOString();
  if (typeof count === "number") stage.count = count;
  if (note) stage.note = note;
}

export function errorStage(stage: PipelineStage, error: string): void {
  stage.status = "error";
  stage.finishedAt = new Date().toISOString();
  stage.error = error;
}

export function skipStage(stage: PipelineStage, reason: string): void {
  stage.status = "skipped";
  stage.finishedAt = new Date().toISOString();
  stage.note = reason;
}

/** Build deterministic stats that we feed into the LLM prompts. */
export function buildDeterministicStats(reviews: CleanReview[]) {
  const versionCounts: Record<string, number> = {};
  for (const r of reviews) {
    const v = r.version ?? "(unknown)";
    versionCounts[v] = (versionCounts[v] ?? 0) + 1;
  }
  return {
    total: reviews.length,
    avgRating: avgRating(reviews),
    ratingDistribution: ratingDistribution(reviews),
    versionCounts,
  };
}

/** Post-process model output: strip review ids not in the input set, recompute sample sizes. */
export function sanitizeTopics(
  topics: Topic[],
  knownIds: Set<string>,
): { topics: Topic[]; stripped: number } {
  let stripped = 0;
  const clean: Topic[] = [];
  for (const t of topics) {
    const reviewIds = t.reviewIds.filter((id) => {
      const ok = knownIds.has(id);
      if (!ok) stripped++;
      return ok;
    });
    if (reviewIds.length === 0) {
      stripped++;
      continue;
    }
    clean.push({ ...t, reviewIds });
  }
  return { topics: clean, stripped };
}

export function sanitizeFindings(
  findings: Finding[],
  knownIds: Set<string>,
  knownTopicIds: Set<string>,
): { findings: Finding[]; stripped: number } {
  let stripped = 0;
  const clean: Finding[] = [];
  for (const f of findings) {
    const reviewIds = f.reviewIds.filter((id) => {
      const ok = knownIds.has(id);
      if (!ok) stripped++;
      return ok;
    });
    const topicIds = f.topicIds.filter((id) => knownTopicIds.has(id));
    if (reviewIds.length === 0) {
      stripped++;
      continue;
    }
    clean.push({ ...f, reviewIds, topicIds });
  }
  return { findings: clean, stripped };
}

export function sanitizeRequirements(
  reqs: Requirement[],
  knownFindingIds: Set<string>,
  knownTopicIds: Set<string>,
): { reqs: Requirement[]; stripped: number } {
  let stripped = 0;
  const clean: Requirement[] = [];
  for (const r of reqs) {
    const findingIds = r.findingIds.filter((id) => knownFindingIds.has(id));
    const topicIds = r.topicIds.filter((id) => knownTopicIds.has(id));
    if (findingIds.length === 0) {
      stripped++;
      continue;
    }
    clean.push({ ...r, findingIds, topicIds });
  }
  return { reqs: clean, stripped };
}

export function sanitizeTestCases(
  tests: TestCase[],
  knownReqIds: Set<string>,
  knownReviewIds: Set<string>,
): { tests: TestCase[]; stripped: number } {
  let stripped = 0;
  const clean: TestCase[] = [];
  for (const t of tests) {
    if (!knownReqIds.has(t.requirementId)) {
      stripped++;
      continue;
    }
    const reviewIds = t.reviewIds.filter((id) => {
      const ok = knownReviewIds.has(id);
      if (!ok) stripped++;
      return ok;
    });
    if (reviewIds.length === 0) {
      stripped++;
      continue;
    }
    clean.push({ ...t, reviewIds });
  }
  return { tests: clean, stripped };
}

/** Helper: build release plan lookups from requirement ids. */
export function indexReleases(
  releases: ReleasePlan[],
  knownReqIds: Set<string>,
): ReleasePlan[] {
  return releases
    .map((r) => ({
      ...r,
      requirementIds: r.requirementIds.filter((id) => knownReqIds.has(id)),
    }))
    .filter((r) => r.requirementIds.length > 0);
}

/** Stable id generator for new objects (topics, findings, reqs, tests). */
let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

/** Empty result skeleton (used when the pipeline must abort early). */
export function emptyResult(
  appId: string,
  appUrl: string,
  goal: AnalysisGoal,
  stages: PipelineStage[],
  caveats: string[],
  dataProvenance: AnalysisResult["dataProvenance"],
): AnalysisResult {
  return {
    appId,
    appUrl,
    country: "us",
    appMeta: {},
    goal,
    stages,
    rawReviews: [] as RawReview[],
    cleanReviews: [] as CleanReview[],
    topics: [] as Topic[],
    findings: { topics: [], findings: [] },
    requirements: [] as Requirement[],
    testCases: [] as TestCase[],
    releases: [] as ReleasePlan[],
    traceability: { requirements: [], testCases: [], unsupportedConclusions: [] },
    provenance: {
      llmProvider: "Anthropic",
      llmModel: "(not invoked)",
      prompts: [],
      failureStrategy: "Pipeline aborted early; LLM was not invoked.",
      hallucinationGuards: [],
    },
    caveats,
    dataProvenance,
  };
}
