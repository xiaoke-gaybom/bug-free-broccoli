// Shared domain types for the review → PRD → test case pipeline.

/** A raw review fetched from the App Store RSS feed (or imported via CSV/JSON). */
export interface RawReview {
  /** Stable hash id derived from author + content + date (see clean.ts). */
  id: string;
  /** Original review id from App Store if available. */
  externalId?: string;
  author: string;
  rating: number; // 1..5
  title: string;
  content: string;
  version?: string;
  isoDate: string; // ISO date string
  url?: string;
  /** Source provenance: "rss:us" | "csv:import" | "json:import" | "cache" */
  source: string;
}

/** A review that has been normalized, de-duplicated and lightly enriched. */
export interface CleanReview {
  id: string;
  externalId?: string;
  author: string;
  rating: number;
  title: string;
  content: string;
  contentLen: number;
  version?: string;
  isoDate: string;
  url?: string;
  source: string;
  /** Lowercased tokens used by deterministic stats (length only, no semantic). */
  tokenCount: number;
  /** Flags raised by deterministic rules (profanity-free, dup, lang guess, etc.). */
  flags: string[];
}

/** A topic discovered dynamically by the LLM (NOT a hard-coded taxonomy). */
export interface Topic {
  id: string;
  label: string;
  /** Short model-written description of what this cluster is about. */
  description: string;
  /** Review ids that belong to this cluster (traceable). */
  reviewIds: string[];
  /** Average rating across the cluster. */
  avgRating: number;
  /** Model-stated confidence 0..1. */
  confidence: number;
  /** Whether reviews within the topic are positive-leaning or negative-leaning. */
  sentiment: "positive" | "negative" | "mixed";
}

/** A consolidated finding backed by evidence (reviews). */
export interface Finding {
  id: string;
  title: string;
  summary: string;
  /** Ids of reviews that support this finding (traceable). */
  reviewIds: string[];
  /** Topic ids that this finding relates to. */
  topicIds: string[];
  /** Number of supporting reviews (derived from reviewIds length). */
  sampleSize: number;
  /** Model confidence 0..1. */
  confidence: number;
  /** Important contradicting evidence (if any), with reviewIds. */
  contradictions?: { summary: string; reviewIds: string[] };
  /** "model" or "stat" — distinguishes model-generated vs deterministic. */
  evidenceType: "model" | "stat";
  /** Star rating distribution supporting the finding. */
  ratingDistribution: Record<string, number>;
}

/** A product requirement, generated from findings. */
export interface Requirement {
  id: string;
  title: string;
  userStory: string;
  acceptanceCriteria: string[];
  priority: "P0" | "P1" | "P2";
  /** Finding ids that justify this requirement (traceable). */
  findingIds: string[];
  /** Topic ids relevant to this requirement. */
  topicIds: string[];
  /** Version this requirement is scheduled for. */
  targetVersion: string;
  rationale: string;
  assumptions?: string[];
}

/** A test case verifying a requirement. */
export interface TestCase {
  id: string;
  title: string;
  /** Requirement under test. */
  requirementId: string;
  /** Pre-conditions, steps, and expected results. */
  steps: string[];
  expectedResult: string;
  /** Type of test (functional, regression, smoke, etc.). */
  type: string;
  /** Review ids the test case must defend against (traceable end-to-end). */
  reviewIds: string[];
}

/** A planned release that groups requirements. */
export interface ReleasePlan {
  version: string;
  theme: string;
  requirementIds: string[];
  rationale: string;
}

/** One stage in the pipeline (for live progress UI). */
export interface PipelineStage {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  startedAt?: string;
  finishedAt?: string;
  /** Short human-readable note about what happened in this stage. */
  note?: string;
  /** Error message if status === "error". */
  error?: string;
  /** Count of records produced by this stage (for quick stats). */
  count?: number;
}

/** A user-provided analysis goal (free-text + structured hints). */
export interface AnalysisGoal {
  /** Raw goal text, e.g. "Focus on subscription conversion in v7.3.0". */
  text: string;
  /** Optional parsed focus areas. */
  focusAreas?: string[];
  /** Optional: restrict to a specific app version. */
  appVersion?: string;
  /** Optional: restrict to ratings <= this value (e.g. 2 for low-score focus). */
  maxRating?: number;
}

/** The full analysis result returned to the UI. */
export interface AnalysisResult {
  appId: string;
  appUrl: string;
  country: string;
  appMeta: {
    trackName?: string;
    seller?: string;
    version?: string;
    genres?: string[];
    description?: string;
  };
  goal: AnalysisGoal;
  stages: PipelineStage[];
  rawReviews: RawReview[];
  cleanReviews: CleanReview[];
  topics: Topic[];
  findings: Findings;
  requirements: Requirement[];
  testCases: TestCase[];
  releases: ReleasePlan[];
  /** Traceability report: which conclusions are evidence-backed. */
  traceability: {
    requirements: { requirementId: string; reviews: string[]; status: "ok" | "assumption" | "untraced" }[];
    testCases: { testCaseId: string; requirementId: string; reviews: string[]; status: "ok" | "assumption" }[];
    unsupportedConclusions: string[];
  };
  /** Model provenance metadata required by the assignment. */
  provenance: {
    llmProvider: string;
    llmModel: string;
    prompts: { stage: string; systemPrompt: string; toolName?: string; config?: Record<string, unknown> }[];
    failureStrategy: string;
    hallucinationGuards: string[];
  };
  /** Limitations / data caveats. */
  caveats: string[];
  /** Whether cached or fresh data was used. */
  dataProvenance: "fresh" | "cache" | "import";
}

/** Internal intermediate type for aggregated findings (grouped). */
export interface Findings {
  topics: Topic[];
  findings: Finding[];
}
