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
import { applyGoalFilter, ratingDistribution, avgRating } from "../reviews/clean";
import { fetchReviews } from "../appstore/rss";
import { cleanReviews } from "../reviews/clean";
import { parseAppRef } from "../appstore/parser";
import {
  buildFollowupPrompt,
  buildFindingSystemPrompt,
  buildPrdSystemPrompt,
  buildTestSystemPrompt,
  buildTopicSystemPrompt,
  buildTraceabilitySystemPrompt,
  buildUserPrompt,
  FindingItemSchema,
  FindingListSchema,
  RequirementItemSchema,
  RequirementListSchema,
  TestCaseItemSchema,
  TestCaseListSchema,
  TopicItemSchema,
  TopicListSchema,
  TraceabilitySchema,
  zodToToolSchema,
  type PromptContext,
} from "../llm/prompts";
import { buildProvenance, LlmError, runTool } from "../llm/claude";
import {
  buildDeterministicStats,
  emptyResult,
  errorStage,
  finishStage,
  indexReleases,
  makeStage,
  nextId,
  resetIdCounter,
  sanitizeFindings,
  sanitizeRequirements,
  sanitizeTestCases,
  sanitizeTopics,
  skipStage,
  startStage,
} from "./stages";
import { readSample } from "../appstore/cache";

/**
 * The full pipeline. Runs deterministic stages always; runs LLM stages only
 * if ANTHROPIC_API_KEY is configured. On any LLM failure, the LLM stages
 * abort with a clear error and downstream stages are skipped (NOT fabricated).
 */

export interface RunInput {
  /** App Store URL or numeric app id. */
  appRef: string;
  goal: AnalysisGoal;
  /** Optional pre-imported reviews (skip RSS collection when supplied). */
  importedReviews?: RawReview[];
  hooks?: { onStageUpdate?: (stage: PipelineStage) => void; signal?: AbortSignal };
}

export async function runPipeline(input: RunInput): Promise<AnalysisResult> {
  resetIdCounter();
  const stages: PipelineStage[] = [
    makeStage("scope", "Determine analysis scope"),
    makeStage("collect", "Collect reviews"),
    makeStage("clean", "Clean & de-duplicate"),
    makeStage("filter", "Apply goal filter"),
    makeStage("topics", "Discover topics (LLM)"),
    makeStage("findings", "Consolidate findings (LLM)"),
    makeStage("prd", "Generate PRD (LLM)"),
    makeStage("tests", "Generate test cases (LLM)"),
    makeStage("trace", "Verify traceability (LLM)"),
  ];

  const emit = (s: PipelineStage) => input.hooks?.onStageUpdate?.(s);

  // Stage 1: scope
  startStage(stages[0]);
  let ref;
  try {
    ref = parseAppRef(input.appRef);
  } catch (err) {
    errorStage(stages[0], (err as Error).message);
    emit(stages[0]);
    return emptyResult("", input.appRef, input.goal, stages, [(err as Error).message], "import");
  }
  finishStage(stages[0], undefined, `appId=${ref.appId} dataCountry=${ref.dataCountry}`);
  emit(stages[0]);

  // Stage 2: collect
  startStage(stages[1]);
  let rawReviews: RawReview[] = [];
  let appMeta: AnalysisResult["appMeta"] = {};
  let dataProvenance: AnalysisResult["dataProvenance"] = "fresh";
  let collectNote = "";
  if (input.importedReviews && input.importedReviews.length > 0) {
    rawReviews = input.importedReviews.map((r) => ({ ...r, source: r.source || "import" }));
    dataProvenance = "import";
    collectNote = `imported ${rawReviews.length} reviews`;
  } else {
    try {
      const fetched = await fetchReviews(ref.appId, { signal: input.hooks?.signal });
      rawReviews = fetched.reviews;
      appMeta = {
        trackName: fetched.meta.trackName,
        seller: fetched.meta.sellerName,
        version: fetched.meta.version,
        genres: fetched.meta.genres,
        description: fetched.meta.description,
      };
      if (fetched.fromCache) {
        dataProvenance = "cache";
        collectNote = `cache hit (${rawReviews.length} reviews)`;
      } else {
        collectNote = fetched.note
          ? `${rawReviews.length} reviews (${fetched.note})`
          : `${rawReviews.length} reviews`;
      }
    } catch (err) {
      errorStage(stages[1], (err as Error).message);
      emit(stages[1]);
      // Try the committed sample dataset as a documented fallback.
      const sample = await readSample<{ reviews: RawReview[]; meta: any }>(
        "data/sample/reviews-us-839285684.json",
      );
      if (sample) {
        rawReviews = sample.reviews.map((r) => ({ ...r, source: "cache:sample" }));
        appMeta = sample.meta ?? {};
        dataProvenance = "cache";
        collectNote = `network failed; loaded committed sample dataset (${rawReviews.length} reviews)`;
        // Replace error with done + note.
        stages[1].status = "done";
        stages[1].error = undefined;
        finishStage(stages[1], rawReviews.length, collectNote);
      } else {
        return emptyResult(ref.appId, ref.canonicalUrl, input.goal, stages, [
          `Failed to fetch reviews: ${(err as Error).message}. No sample dataset available.`,
        ], "fresh");
      }
    }
  }
  finishStage(stages[1], rawReviews.length, collectNote);
  emit(stages[1]);

  // Stage 3: clean
  startStage(stages[2]);
  const cleaned = cleanReviews(rawReviews);
  finishStage(
    stages[2],
    cleaned.clean.length,
    `dropped ${cleaned.droppedDuplicate} dup, ${cleaned.droppedEmpty} empty; flagged ${cleaned.flaggedLowContent} low-content`,
  );
  emit(stages[2]);

  // Stage 4: apply goal filter (deterministic)
  startStage(stages[3]);
  const { filtered, excluded } = applyGoalFilter(cleaned.clean, input.goal);
  finishStage(stages[3], filtered.length, `excluded ${excluded} by goal filter`);
  emit(stages[3]);

  const caveats: string[] = [];
  if (filtered.length === 0) {
    caveats.push("Goal filter excluded all reviews; analysis cannot proceed.");
    skipStage(stages[4], "no reviews left after filter");
    skipStage(stages[5], "no reviews");
    skipStage(stages[6], "no findings");
    skipStage(stages[7], "no requirements");
    skipStage(stages[8], "nothing to verify");
    return emptyResult(ref.appId, ref.canonicalUrl, input.goal, stages, caveats, dataProvenance);
  }
  if (filtered.length < 10) {
    caveats.push(
      `Only ${filtered.length} reviews available after filtering — findings may be under-powered.`,
    );
  }
  if (dataProvenance !== "fresh") {
    caveats.push(
      `Data provenance: ${dataProvenance}. Results are based on ${
        dataProvenance === "cache" ? "cached" : "imported"
      } data; pipeline can re-run on fresh input when network + key are available.`,
    );
  }

  const knownReviewIds = new Set(filtered.map((r) => r.id));
  const ctx: PromptContext = {
    appName: appMeta.trackName || ref.appId,
    appMeta,
    goal: input.goal,
    stats: buildDeterministicStats(filtered),
  };
  const userPrompt = buildUserPrompt(ctx, filtered);

  // ---- LLM stages start here. Any failure aborts downstream stages. ----

  const prompts: AnalysisResult["provenance"]["prompts"] = [];
  const unsupportedConclusions: string[] = [];

  // Stage 5: topics
  let topics: Topic[] = [];
  startStage(stages[4]);
  emit(stages[4]);
  try {
    const result = await runTool<{ topics: any[] }>({
      systemPrompt: buildTopicSystemPrompt(),
      userPrompt,
      toolName: "discover_topics",
      toolSchema: zodToToolSchema(TopicListSchema),
      schema: TopicListSchema,
      temperature: 0,
      maxTokens: 4096,
    });
    topics = result.data.topics.map((t) => ({
      id: nextId("topic"),
      label: t.label,
      description: t.description,
      reviewIds: t.reviewIds,
      avgRating: avgRating(filtered.filter((r) => t.reviewIds.includes(r.id))),
      confidence: t.confidence,
      sentiment: t.sentiment,
    }));
    const sanit = sanitizeTopics(topics, knownReviewIds);
    topics = sanit.topics;
    finishStage(stages[4], topics.length, sanit.stripped ? `stripped ${sanit.stripped} unknown review ids` : undefined);
    prompts.push({
      stage: "topics",
      systemPrompt: buildTopicSystemPrompt(),
      toolName: "discover_topics",
      config: { temperature: 0, maxTokens: 4096, model: "claude-3-5-sonnet-latest" },
    });
  } catch (err) {
    errorStage(stages[4], (err as Error).message);
    emit(stages[4]);
    skipStage(stages[5], "topics stage failed");
    skipStage(stages[6], "topics stage failed");
    skipStage(stages[7], "topics stage failed");
    skipStage(stages[8], "topics stage failed");
    caveats.push(`Topic discovery failed: ${(err as Error).message}`);
    return emptyResult(ref.appId, ref.canonicalUrl, input.goal, stages, caveats, dataProvenance);
  }
  emit(stages[4]);

  // Stage 6: findings
  let findings: Finding[] = [];
  startStage(stages[5]);
  emit(stages[5]);
  const knownTopicIds = new Set(topics.map((t) => t.id));
  try {
    const result = await runTool<{ findings: any[] }>({
      systemPrompt: buildFindingSystemPrompt(),
      userPrompt: `${userPrompt}\n\n${buildFollowupPrompt("topics", topics.map(({ id, label, description }) => ({ id, label, description })))}`,
      toolName: "consolidate_findings",
      toolSchema: zodToToolSchema(FindingListSchema),
      schema: FindingListSchema,
      temperature: 0,
      maxTokens: 4096,
    });
    findings = result.data.findings.map((f) => ({
      id: nextId("find"),
      title: f.title,
      summary: f.summary,
      reviewIds: f.reviewIds,
      topicIds: f.topicIds,
      sampleSize: f.reviewIds.length,
      confidence: f.confidence,
      contradictions: f.contradictions,
      evidenceType: "model" as const,
      ratingDistribution: ratingDistribution(
        filtered.filter((r) => f.reviewIds.includes(r.id)),
      ),
    }));
    const sanit = sanitizeFindings(findings, knownReviewIds, knownTopicIds);
    findings = sanit.findings;
    finishStage(stages[5], findings.length, sanit.stripped ? `stripped ${sanit.stripped} unknown ids` : undefined);
    prompts.push({
      stage: "findings",
      systemPrompt: buildFindingSystemPrompt(),
      toolName: "consolidate_findings",
      config: { temperature: 0, maxTokens: 4096 },
    });
  } catch (err) {
    errorStage(stages[5], (err as Error).message);
    emit(stages[5]);
    skipStage(stages[6], "findings stage failed");
    skipStage(stages[7], "findings stage failed");
    skipStage(stages[8], "findings stage failed");
    caveats.push(`Finding consolidation failed: ${(err as Error).message}`);
    return emptyResult(ref.appId, ref.canonicalUrl, input.goal, stages, caveats, dataProvenance);
  }
  emit(stages[5]);

  // Stage 7: PRD
  let requirements: Requirement[] = [];
  let releases: ReleasePlan[] = [];
  startStage(stages[6]);
  emit(stages[6]);
  const knownFindingIds = new Set(findings.map((f) => f.id));
  try {
    const result = await runTool<{ requirements: any[]; releases: any[] }>({
      systemPrompt: buildPrdSystemPrompt(),
      userPrompt: `${userPrompt}\n\n${buildFollowupPrompt("findings", findings.map(({ id, title, summary, reviewIds, confidence, contradictions }) => ({ id, title, summary, reviewIds, confidence, contradictions })))}`,
      toolName: "draft_prd",
      toolSchema: zodToToolSchema(RequirementListSchema),
      schema: RequirementListSchema,
      temperature: 0,
      maxTokens: 4096,
    });
    requirements = result.data.requirements.map((r) => ({
      id: nextId("req"),
      title: r.title,
      userStory: r.userStory,
      acceptanceCriteria: r.acceptanceCriteria,
      priority: r.priority,
      findingIds: r.findingIds,
      topicIds: r.topicIds,
      targetVersion: r.targetVersion,
      rationale: r.rationale,
      assumptions: r.assumptions,
    }));
    releases = result.data.releases.map((rel) => ({
      version: rel.version,
      theme: rel.theme,
      requirementIds: rel.requirementIds,
      rationale: rel.rationale,
    }));
    const sanit = sanitizeRequirements(requirements, knownFindingIds, knownTopicIds);
    requirements = sanit.reqs;
    // Now we know final requirement ids; remap releases (which referenced
    // pre-id reqs that the model produced in the same call).
    // The model emits requirementIds matching its own requirement list, which
    // is in input order. We map them positionally.
    if (result.data.requirements.length === requirements.length) {
      const idMap = new Map<string, string>();
      result.data.requirements.forEach((orig: { _id?: string }, i: number) => {
        const origId = (orig as any)._id ?? `req_${i}`;
        idMap.set(origId, requirements[i].id);
      });
      // The model emits requirementIds as "req_0", "req_1" etc. (positional)
      // so map positional indexes to new ids.
      releases = result.data.releases.map((rel) => ({
        version: rel.version,
        theme: rel.theme,
        requirementIds: (rel.requirementIds as string[])
          .map((oid: string) => {
            const m = oid.match(/(\d+)/);
            if (m) return requirements[Number(m[1])]?.id;
            return idMap.get(oid);
          })
          .filter(Boolean) as string[],
        rationale: rel.rationale,
      }));
    }
    releases = indexReleases(releases, new Set(requirements.map((r) => r.id)));
    finishStage(stages[6], requirements.length, `${releases.length} release(s) planned`);
    prompts.push({
      stage: "prd",
      systemPrompt: buildPrdSystemPrompt(),
      toolName: "draft_prd",
      config: { temperature: 0, maxTokens: 4096 },
    });
  } catch (err) {
    errorStage(stages[6], (err as Error).message);
    emit(stages[6]);
    skipStage(stages[7], "prd stage failed");
    skipStage(stages[8], "prd stage failed");
    caveats.push(`PRD generation failed: ${(err as Error).message}`);
    return emptyResult(ref.appId, ref.canonicalUrl, input.goal, stages, caveats, dataProvenance);
  }
  emit(stages[6]);

  // Stage 8: test cases
  let testCases: TestCase[] = [];
  startStage(stages[7]);
  emit(stages[7]);
  const knownReqIds = new Set(requirements.map((r) => r.id));
  try {
    const result = await runTool<{ testCases: any[] }>({
      systemPrompt: buildTestSystemPrompt(),
      userPrompt: `${userPrompt}\n\n${buildFollowupPrompt("requirements", requirements.map(({ id, title, userStory, acceptanceCriteria, findingIds, targetVersion, priority }) => ({ id, title, userStory, acceptanceCriteria, findingIds, targetVersion, priority })))}`,
      toolName: "draft_tests",
      toolSchema: zodToToolSchema(TestCaseListSchema),
      schema: TestCaseListSchema,
      temperature: 0,
      maxTokens: 4096,
    });
    testCases = result.data.testCases.map((t) => ({
      id: nextId("test"),
      title: t.title,
      requirementId: t.requirementId,
      steps: t.steps,
      expectedResult: t.expectedResult,
      type: t.type,
      reviewIds: t.reviewIds,
    }));
    // Map model's positional requirementId ("req_N") to our actual ids.
    testCases = testCases.map((t) => {
      const m = t.requirementId.match(/(\d+)/);
      if (m) {
        const realReq = requirements[Number(m[1])];
        if (realReq) return { ...t, requirementId: realReq.id };
      }
      return t;
    });
    const sanit = sanitizeTestCases(testCases, knownReqIds, knownReviewIds);
    testCases = sanit.tests;
    finishStage(stages[7], testCases.length, sanit.stripped ? `stripped ${sanit.stripped} unknown ids` : undefined);
    prompts.push({
      stage: "tests",
      systemPrompt: buildTestSystemPrompt(),
      toolName: "draft_tests",
      config: { temperature: 0, maxTokens: 4096 },
    });
  } catch (err) {
    errorStage(stages[7], (err as Error).message);
    emit(stages[7]);
    skipStage(stages[8], "tests stage failed");
    caveats.push(`Test case generation failed: ${(err as Error).message}`);
    return emptyResult(ref.appId, ref.canonicalUrl, input.goal, stages, caveats, dataProvenance);
  }
  emit(stages[7]);

  // Stage 9: traceability verification
  let traceability: AnalysisResult["traceability"] = {
    requirements: [],
    testCases: [],
    unsupportedConclusions: [],
  };
  startStage(stages[8]);
  emit(stages[8]);
  try {
    const result = await runTool<{
      requirements: any[];
      testCases: any[];
      unsupportedConclusions: string[];
    }>({
      systemPrompt: buildTraceabilitySystemPrompt(),
      userPrompt: `${userPrompt}\n\n${buildFollowupPrompt(
        "findings+requirements+tests",
        {
          findings: findings.map(({ id, title, reviewIds, confidence }) => ({ id, title, reviewIds, confidence })),
          requirements: requirements.map(({ id, title, findingIds }) => ({ id, title, findingIds })),
          testCases: testCases.map(({ id, title, requirementId, reviewIds }) => ({ id, title, requirementId, reviewIds })),
        },
      )}`,
      toolName: "verify_traceability",
      toolSchema: zodToToolSchema(TraceabilitySchema),
      schema: TraceabilitySchema,
      temperature: 0,
      maxTokens: 2048,
    });
    // Map positional ids again.
    const reqStatusMap = result.data.requirements.map((r: any, i: number) => ({
      requirementId: requirements[i]?.id ?? r.requirementId,
      status: r.status,
      reviews: r.reviews ?? [],
    }));
    const tcStatusMap = result.data.testCases.map((t: any, i: number) => ({
      testCaseId: testCases[i]?.id ?? t.testCaseId,
      requirementId: testCases[i]?.requirementId,
      status: t.status,
      reviews: t.reviews ?? [],
    }));
    traceability = {
      requirements: reqStatusMap,
      testCases: tcStatusMap,
      unsupportedConclusions: result.data.unsupportedConclusions ?? [],
    };
    unsupportedConclusions.push(...(result.data.unsupportedConclusions ?? []));
    finishStage(stages[8], traceability.requirements.length, traceability.unsupportedConclusions.length ? `${traceability.unsupportedConclusions.length} unsupported conclusions flagged` : "all chains verified");
    prompts.push({
      stage: "trace",
      systemPrompt: buildTraceabilitySystemPrompt(),
      toolName: "verify_traceability",
      config: { temperature: 0, maxTokens: 2048 },
    });
  } catch (err) {
    errorStage(stages[8], (err as Error).message);
    emit(stages[8]);
    caveats.push(`Traceability verification failed: ${(err as Error).message}`);
  }
  emit(stages[8]);

  const provenance = buildProvenance("pipeline", "multi-stage", "see prompts[]", {
    stages: prompts.map((p) => p.stage),
  });

  return {
    appId: ref.appId,
    appUrl: ref.canonicalUrl,
    country: ref.dataCountry,
    appMeta,
    goal: input.goal,
    stages,
    rawReviews,
    cleanReviews: filtered,
    topics,
    findings: { topics, findings },
    requirements,
    testCases,
    releases,
    traceability,
    provenance: {
      llmProvider: provenance.llmProvider,
      llmModel: provenance.llmModel,
      prompts,
      failureStrategy: provenance.failureStrategy,
      hallucinationGuards: provenance.hallucinationGuards,
    },
    caveats,
    dataProvenance,
  };
}
