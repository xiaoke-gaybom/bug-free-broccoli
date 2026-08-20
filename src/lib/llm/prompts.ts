import { z } from "zod";
import type { CleanReview } from "../types";

/**
 * Prompt engineering for the model-driven semantic stages.
 *
 * Critical requirement from the assignment:
 *   "At least one core semantic task must be model-driven. Suitable tasks
 *    include dynamic topic discovery, problem consolidation, evidence-based
 *    analysis, requirement generation or test case generation. Achieving all
 *    semantic analysis through fixed keywords, regex, lookup tables or
 *    manual pre-defined mappings does NOT satisfy this requirement."
 *
 * These prompts deliberately avoid seeding the model with a fixed taxonomy.
 * The model invents topic labels from the data itself.
 */

const GUARD_PREAMBLE = `You are a senior product analyst working from real App Store reviews.

STRICT RULES (violations are unacceptable):
1. NEVER fabricate review ids. Only cite ids that appear in the REVIEW LIST below.
2. NEVER invent user quotes. When you reference user feedback, paraphrase.
3. Every finding MUST include a confidence score in [0,1] and a sample size
   (= number of cited review ids).
4. When evidence is conflicting or thin, you MUST say so in the "contradictions"
   field — do not paper over uncertainty.
5. Do NOT use a fixed taxonomy. Discover topic labels from the actual review
   content; the topics must be specific to THIS app's reviews.
6. Do NOT include conclusions you cannot back with cited review ids.
7. Reply ONLY via the provided tool. Do not output any prose outside the tool call.`;

const SCHEMA_PREAMBLE = `The output schema is enforced via tool-use; schema validation
will reject your output if any required field is missing or any id is unknown.`;

export interface PromptContext {
  appName: string;
  appMeta: { seller?: string; version?: string; genres?: string[] };
  goal: { text: string; focusAreas?: string[]; appVersion?: string; maxRating?: number };
  stats: {
    total: number;
    avgRating: number;
    ratingDistribution: Record<string, number>;
    versionCounts: Record<string, number>;
  };
}

export function buildTopicSystemPrompt(): string {
  return `${GUARD_PREAMBLE}

YOUR TASK: Discover 4-10 distinct topics that naturally cluster the reviews.
Topics must be DATA-DRIVEN — emerge them from what users actually complain
about or praise in THIS app, do not impose generic categories like "UI",
"Performance", "Bugs" unless the data clearly supports them.

For each topic, list the review ids that belong to it. A review may belong to
multiple topics. Provide a 1-2 sentence description specific to this app.

${SCHEMA_PREAMBLE}`;
}

export function buildFindingSystemPrompt(): string {
  return `${GUARD_PREAMBLE}

YOUR TASK: Consolidate reviews into 3-8 actionable findings. Each finding
states a concrete user problem or opportunity, the review ids that support
it, the topic ids it relates to, a confidence score, and any contradicting
evidence.

HALLUCINATION GUARD: For each finding, after you draft it, double-check that
every cited review id actually mentions the issue you describe. If a review
id is only weakly related, drop it. If you have < 2 supporting reviews,
lower confidence to < 0.5 and flag in contradictions.

${SCHEMA_PREAMBLE}`;
}

export function buildPrdSystemPrompt(): string {
  return `${GUARD_PREAMBLE}

YOUR TASK: Draft a focused PRD. Generate 3-7 product requirements, each
traceable to specific finding ids (and through them, to review ids).

REQUIREMENTS:
- Every requirement MUST cite at least one findingId that justifies it.
- Split into at most 2 versions (e.g. v1 quick wins, v2 deeper fixes).
- Assign priority P0/P1/P2 and targetVersion.
- Each requirement needs a user story, 2-4 acceptance criteria, and a
  rationale tying it back to the user evidence.
- If you cannot justify a requirement from findings, DO NOT include it.
- Mark assumptions explicitly in the "assumptions" field.

${SCHEMA_PREAMBLE}`;
}

export function buildTestSystemPrompt(): string {
  return `${GUARD_PREAMBLE}

YOUR TASK: Generate test cases that verify each PRD requirement actually
solves the user problems raised in the source reviews.

Each test case must:
- Reference exactly ONE requirementId (the requirement under test).
- Reference the review ids that the test case defends against (i.e. tests
  that the requirement's solution would have prevented those user complaints).
- Provide ordered steps, an expected result, and a test type.
- Cover at least 1 test case per requirement.

${SCHEMA_PREAMBLE}`;
}

export function buildTraceabilitySystemPrompt(): string {
  return `${GUARD_PREAMBLE}

YOUR TASK: Audit the traceability chain from review → finding → requirement →
test case. For every requirement and every test case, classify as:
- "ok" if every cited review id is real and supports the chain.
- "assumption" if the chain is plausible but evidence is thin (< 2 reviews
  or confidence < 0.5).
- "untraced" (requirements only) if it cannot be traced back to any review.

Also list any conclusions that you cannot back with cited evidence; these will
be stripped or marked as assumptions in the final report.

${SCHEMA_PREAMBLE}`;
}

/** Render the user prompt with review data, for any stage. */
export function buildUserPrompt(
  ctx: PromptContext,
  reviews: CleanReview[],
  extra?: string,
): string {
  const compact = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    version: r.version ?? "",
    title: r.title,
    content: r.content,
  }));
  const lines: string[] = [];
  lines.push(`# App context`);
  lines.push(`name: ${ctx.appName}`);
  if (ctx.appMeta.seller) lines.push(`seller: ${ctx.appMeta.seller}`);
  if (ctx.appMeta.version) lines.push(`latest version: ${ctx.appMeta.version}`);
  if (ctx.appMeta.genres?.length) lines.push(`genres: ${ctx.appMeta.genres.join(", ")}`);
  lines.push(`# Analysis goal`);
  lines.push(ctx.goal.text || "(no specific goal — analyze holistically)");
  if (ctx.goal.focusAreas?.length) lines.push(`focus areas: ${ctx.goal.focusAreas.join(", ")}`);
  if (ctx.goal.appVersion) lines.push(`restrict to version: ${ctx.goal.appVersion}`);
  if (typeof ctx.goal.maxRating === "number") lines.push(`restrict to ratings <= ${ctx.goal.maxRating}`);
  lines.push(`# Deterministic statistics (computed by rules, not the model)`);
  lines.push(`total reviews: ${ctx.stats.total}`);
  lines.push(`avg rating: ${ctx.stats.avgRating.toFixed(2)}`);
  lines.push(`rating distribution: ${JSON.stringify(ctx.stats.ratingDistribution)}`);
  lines.push(`top versions: ${JSON.stringify(ctx.stats.versionCounts)}`);
  lines.push(`# Review list (${reviews.length} reviews)`);
  lines.push("```json");
  lines.push(JSON.stringify(compact, null, 2));
  lines.push("```");
  if (extra) {
    lines.push(extra);
  }
  return lines.join("\n");
}

/** Render a follow-up prompt that supplies prior-stage results to a later stage. */
export function buildFollowupPrompt(label: string, payload: unknown): string {
  return `# Prior-stage output: ${label}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

// --- Schemas (used both for tool input_schema and zod validation) --------

export const TopicItemSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  reviewIds: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
  sentiment: z.enum(["positive", "negative", "mixed"]),
});
export const TopicListSchema = z.object({
  topics: z.array(TopicItemSchema).min(1),
});

export const FindingItemSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  reviewIds: z.array(z.string()).min(1),
  topicIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  contradictions: z
    .object({ summary: z.string(), reviewIds: z.array(z.string()) })
    .optional(),
});
export const FindingListSchema = z.object({
  findings: z.array(FindingItemSchema).min(1),
});

export const RequirementItemSchema = z.object({
  title: z.string().min(1),
  userStory: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).min(1),
  priority: z.enum(["P0", "P1", "P2"]),
  targetVersion: z.string().min(1),
  findingIds: z.array(z.string()).min(1),
  topicIds: z.array(z.string()).default([]),
  rationale: z.string().min(1),
  assumptions: z.array(z.string()).optional(),
});
export const RequirementListSchema = z.object({
  requirements: z.array(RequirementItemSchema).min(1),
  releases: z
    .array(
      z.object({
        version: z.string(),
        theme: z.string(),
        requirementIds: z.array(z.string()),
        rationale: z.string(),
      }),
    )
    .min(1),
});

export const TestCaseItemSchema = z.object({
  title: z.string().min(1),
  requirementId: z.string().min(1),
  steps: z.array(z.string()).min(1),
  expectedResult: z.string().min(1),
  type: z.string().min(1),
  reviewIds: z.array(z.string()).min(1),
});
export const TestCaseListSchema = z.object({
  testCases: z.array(TestCaseItemSchema).min(1),
});

export const TraceabilitySchema = z.object({
  requirements: z.array(
    z.object({
      requirementId: z.string(),
      status: z.enum(["ok", "assumption", "untraced"]),
      reviews: z.array(z.string()).default([]),
    }),
  ),
  testCases: z.array(
    z.object({
      testCaseId: z.string(),
      status: z.enum(["ok", "assumption"]),
      reviews: z.array(z.string()).default([]),
    }),
  ),
  unsupportedConclusions: z.array(z.string()).default([]),
});

/** Convert a zod schema description into a JSON-schema-ish object for tool input. */
export function zodToToolSchema(schema: z.ZodObject<any>): Record<string, unknown> {
  // Use the (undocumented but stable) _def to render a rough JSON schema.
  // This is sufficient for Claude tool-use validation.
  const shape = (schema as unknown as { _def: { shape: () => Record<string, z.ZodTypeAny> } })._def.shape();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodFieldToSchema(value as z.ZodTypeAny);
    if (!value.isOptional()) required.push(key);
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function zodFieldToSchema(field: z.ZodTypeAny): Record<string, unknown> {
  if (field instanceof z.ZodString) return { type: "string" };
  if (field instanceof z.ZodNumber) return { type: "number" };
  if (field instanceof z.ZodBoolean) return { type: "boolean" };
  if (field instanceof z.ZodEnum) return { type: "string", enum: field.options };
  if (field instanceof z.ZodArray) {
    return { type: "array", items: zodFieldToSchema(field.element) };
  }
  if (field instanceof z.ZodObject) {
    return zodToToolSchema(field);
  }
  if (field instanceof z.ZodOptional || field instanceof z.ZodDefault) {
    return zodFieldToSchema((field as any)._def.innerType);
  }
  return { type: "string" };
}
