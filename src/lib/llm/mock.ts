import { z } from "zod";
import type { RunToolInput, RunToolResult } from "./claude";
import { LlmError } from "./claude";

/**
 * Mock LLM for offline end-to-end testing.
 *
 * Enabled via env var REVIEW_FORGE_MOCK_LLM=1 (see claude.ts routing).
 *
 * Design goals:
 *  1. Return schema-valid structured output for every pipeline stage so the
 *     full pipeline (topics → findings → PRD → tests → traceability) runs
 *     end-to-end WITHOUT an Anthropic API key.
 *  2. Reference ONLY real review ids parsed from the user prompt — so the
 *     pipeline's post-validation (sanitizeTopics etc.) doesn't strip
 *     everything, and the traceability chain stays intact.
 *  3. Produce coherent, topic-relevant canned content by grouping reviews
 *     by rating + simple content keywords (NOT used as a fixed taxonomy in
 *     production — only here in the mock to make demo output look sane).
 *
 * This is clearly marked in provenance as a MOCK provider so it can never
 * be confused with real model-driven analysis.
 */

const MOCK_PROVIDER = "Mock (offline)";
const MOCK_MODEL = "mock-llm-v1";

export function isMockMode(): boolean {
  return process.env.REVIEW_FORGE_MOCK_LLM === "1";
}

interface ParsedReview {
  id: string;
  rating: number;
  title: string;
  content: string;
  version?: string;
}

/** Extract the review list JSON block from the user prompt. */
function parseReviews(prompt: string): ParsedReview[] {
  // The prompt embeds the review list as ```json ... ``` after "# Review list".
  const marker = "# Review list";
  const idx = prompt.indexOf(marker);
  if (idx === -1) return [];
  const after = prompt.slice(idx);
  const jsonStart = after.indexOf("```json");
  const jsonEnd = after.indexOf("```", jsonStart + 7);
  if (jsonStart === -1 || jsonEnd === -1) return [];
  const jsonStr = after.slice(jsonStart + 7, jsonEnd).trim();
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr)) return [];
    return arr.map((r: any) => ({
      id: String(r.id),
      rating: Number(r.rating),
      title: String(r.title ?? ""),
      content: String(r.content ?? ""),
      version: r.version ? String(r.version) : undefined,
    }));
  } catch {
    return [];
  }
}

/** Extract all ids matching a prefix (e.g. "topic_", "find_", "req_") from the followup section. */
function extractIds(prompt: string, prefix: string): string[] {
  const re = new RegExp(`"${prefix}[a-z0-9]+"`, "g");
  const matches = prompt.match(re) ?? [];
  // dedupe + strip quotes
  return Array.from(new Set(matches.map((m) => m.replace(/"/g, ""))));
}

/** Group reviews by simple keyword heuristics (mock-only). */
function groupReviews(reviews: ParsedReview[]): { key: string; label: string; description: string; sentiment: "positive" | "negative" | "mixed"; ids: string[] }[] {
  const groups: { key: string; label: string; description: string; sentiment: "positive" | "negative" | "mixed"; ids: string[] }[] = [];

  const buckets: { key: string; label: string; description: string; sentiment: "positive" | "negative" | "mixed"; keywords: string[]; ids: string[] }[] = [
    {
      key: "subscription",
      label: "订阅与定价抱怨",
      description: "用户对订阅价格、自动续费、免费试用转付费流程表达不满。",
      sentiment: "negative",
      keywords: ["subscription", "subscribe", "price", "pricing", "expensive", "pay", "payment", "refund", "trial", "cancel"],
      ids: [],
    },
    {
      key: "crashes",
      label: "崩溃与稳定性",
      description: "应用在更新后或特定设备上崩溃、闪退、卡死。",
      sentiment: "negative",
      keywords: ["crash", "crashes", "crashed", "freeze", "freezes", "frozen", "bug", "glitch", "error", "broken", "doesn't work", "does not work"],
      ids: [],
    },
    {
      key: "video",
      label: "视频与播放体验",
      description: "视频播放卡顿、加载慢、声音不同步、语音教练不可用。",
      sentiment: "mixed",
      keywords: ["video", "playback", "play", "loading", "buffer", "sound", "audio", "voice", "coach", "music"],
      ids: [],
    },
    {
      key: "content-variety",
      label: "锻炼内容丰富度",
      description: "用户对锻炼种类、难度分级、教练选择的反馈（多为正面）。",
      sentiment: "positive",
      keywords: ["workout", "exercise", "routine", "variety", "trainer", "plan", "program", "beginner", "intermediate"],
      ids: [],
    },
    {
      key: "praise",
      label: "整体好评",
      description: "高评分用户对应用效果、易用性、坚持动力的肯定。",
      sentiment: "positive",
      keywords: ["love", "great", "amazing", "awesome", "perfect", "best", "recommend", "helpful", "motivat"],
      ids: [],
    },
  ];

  for (const r of reviews) {
    const text = `${r.title} ${r.content}`.toLowerCase();
    let placed = false;
    for (const b of buckets) {
      if (b.keywords.some((k) => text.includes(k))) {
        b.ids.push(r.id);
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Fallback by rating.
      if (r.rating >= 4) buckets.find((b) => b.key === "praise")!.ids.push(r.id);
      else if (r.rating <= 2) buckets.find((b) => b.key === "crashes")!.ids.push(r.id);
      else buckets.find((b) => b.key === "content-variety")!.ids.push(r.id);
    }
  }

  for (const b of buckets) {
    if (b.ids.length > 0) {
      groups.push({
        key: b.key,
        label: b.label,
        description: b.description,
        sentiment: b.sentiment,
        ids: b.ids,
      });
    }
  }
  return groups;
}

function avg(reviews: ParsedReview[], ids: string[]): number {
  const subset = reviews.filter((r) => ids.includes(r.id));
  if (subset.length === 0) return 0;
  return subset.reduce((s, r) => s + r.rating, 0) / subset.length;
}

/** Build the canned response for a given tool, based on the prompt content. */
export async function runMockTool<T = unknown>(input: RunToolInput): Promise<RunToolResult<T>> {
  // Simulate small latency so the SSE UI feels realistic.
  await sleep(150 + Math.random() * 250);

  const reviews = parseReviews(input.userPrompt);
  if (reviews.length === 0) {
    throw new LlmError("Mock could not parse reviews from prompt.");
  }

  const tool = input.toolName;
  const payload = buildMockPayload(tool, reviews, input.userPrompt);

  // Validate against the schema if provided.
  let data = payload as T;
  if (input.schema) {
    const parsed = input.schema.safeParse(payload);
    if (!parsed.success) {
      throw new LlmError(`Mock output failed schema validation for ${tool}: ${parsed.error.message}`);
    }
    data = parsed.data as T;
  }

  return {
    data,
    raw: JSON.stringify(payload),
    usage: { inputTokens: reviews.length * 40, outputTokens: 800 },
  };
}

function buildMockPayload(tool: string, reviews: ParsedReview[], prompt: string): unknown {
  switch (tool) {
    case "discover_topics":
      return buildTopics(reviews);
    case "consolidate_findings":
      return buildFindings(reviews, prompt);
    case "draft_prd":
      return buildPrd(reviews, prompt);
    case "draft_tests":
      return buildTests(reviews, prompt);
    case "verify_traceability":
      return buildTraceability(prompt);
    default:
      throw new LlmError(`Mock has no canned response for tool "${tool}".`);
  }
}

function buildTopics(reviews: ParsedReview[]) {
  const groups = groupReviews(reviews);
  // Take up to 6 groups, ensure each has at least 2 reviews when possible.
  const usable = groups.filter((g) => g.ids.length >= 1).slice(0, 6);
  if (usable.length === 0) {
    // Fallback: single topic with all reviews.
    return {
      topics: [
        {
          label: "全部评论（综合）",
          description: "评论数量不足以聚类，归为单一主题。",
          reviewIds: reviews.map((r) => r.id),
          confidence: 0.5,
          sentiment: "mixed" as const,
        },
      ],
    };
  }
  return {
    topics: usable.map((g) => ({
      label: g.label,
      description: g.description,
      reviewIds: g.ids,
      confidence: g.ids.length >= 5 ? 0.85 : g.ids.length >= 3 ? 0.7 : 0.55,
      sentiment: g.sentiment,
    })),
  };
}

function buildFindings(reviews: ParsedReview[], prompt: string) {
  const topicIds = extractIds(prompt, "topic_");
  const groups = groupReviews(reviews);

  // Build 3-5 findings, each tied to a topic.
  const findings: any[] = [];
  const usedTopicIds = new Set<string>();

  // Map groups to topic ids positionally (groups order matches topics order
  // because both derive from the same heuristic).
  const topicForGroup = (idx: number): string | undefined => {
    if (idx < topicIds.length) {
      usedTopicIds.add(topicIds[idx]);
      return topicIds[idx];
    }
    return undefined;
  };

  groups.slice(0, 5).forEach((g, i) => {
    const topicId = topicForGroup(i);
    const subset = reviews.filter((r) => g.ids.includes(r.id));
    const ratingDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const r of subset) ratingDist[String(r.rating)] = (ratingDist[String(r.rating)] ?? 0) + 1;

    const isNegative = g.sentiment === "negative";
    findings.push({
      title: isNegative
        ? `${g.label}导致用户流失`
        : g.sentiment === "positive"
        ? `${g.label}是核心留存动力`
        : `${g.label}体验不一致`,
      summary: `基于 ${g.ids.length} 条评论，${g.description} 典型评论反映：${subset
        .slice(0, 2)
        .map((r) => `「${(r.title || r.content).slice(0, 60)}」`)
        .join("；")}。`,
      reviewIds: g.ids,
      topicIds: topicId ? [topicId] : [],
      confidence: g.ids.length >= 5 ? 0.82 : g.ids.length >= 3 ? 0.66 : 0.5,
      contradictions: isNegative && subset.some((r) => r.rating >= 4)
        ? {
            summary: "同一主题下存在少数高评分用户，问题可能并非普适。",
            reviewIds: subset.filter((r) => r.rating >= 4).slice(0, 2).map((r) => r.id),
          }
        : undefined,
    });
  });

  if (findings.length === 0) {
    findings.push({
      title: "评论量不足以形成明确发现",
      summary: "当前评论数据较少，建议扩大样本后再分析。",
      reviewIds: reviews.slice(0, 3).map((r) => r.id),
      topicIds: topicIds.slice(0, 1),
      confidence: 0.4,
    });
  }
  return { findings };
}

function buildPrd(reviews: ParsedReview[], prompt: string) {
  const findingIds = extractIds(prompt, "find_");
  const topicIds = extractIds(prompt, "topic_");

  // Create one requirement per finding (up to 5), split across 2 versions.
  const requirements: any[] = [];
  const findingCount = Math.min(findingIds.length, 5);
  for (let i = 0; i < findingCount; i++) {
    const fid = findingIds[i];
    const tid = topicIds[i] ?? topicIds[0];
    const isV1 = i < Math.ceil(findingCount / 2); // first half = v1 (quick wins)
    const version = isV1 ? "1.0" : "2.0";
    const priority = i === 0 ? "P0" : i <= 2 ? "P1" : "P2";
    // Pick a few review ids related to this requirement (deterministic slice).
    const reviewSlice = reviews.slice(i * 2, i * 2 + 3).map((r) => r.id);
    requirements.push({
      title: `修复/优化：${labelForFinding(i)}`,
      userStory: `作为 ${userPersonaFor(i)}，我希望 ${wishFor(i)}，以便 ${benefitFor(i)}。`,
      acceptanceCriteria: [
        `用户在 ${version} 版本中不再遇到：${labelForFinding(i)} 相关的负面评论所描述的问题。`,
        `对应回归测试用例覆盖评论 ${reviewSlice.join(", ")} 的场景。`,
        `指标：相关主题的差评率在下一个版本发布后下降 ≥ 30%。`,
      ],
      priority,
      targetVersion: version,
      findingIds: [fid],
      topicIds: tid ? [tid] : [],
      rationale: `该需求由发现 ${fid} 驱动，对应评论 ${reviewSlice.join(", ")} 反馈的真实用户问题。`,
      assumptions:
        i === findingCount - 1
          ? ["样本量较小，优先级与版本划分基于当前评论分布，需 PM 二次确认。"]
          : undefined,
    });
  }

  const v1 = requirements.filter((r) => r.targetVersion === "1.0");
  const v2 = requirements.filter((r) => r.targetVersion === "2.0");
  const releases: any[] = [
    {
      version: "1.0",
      theme: "快速修复：稳定性与订阅透明度",
      requirementIds: v1.map((_, i) => `req_${i}`),
      rationale: "v1 聚焦高优先级、低成本修复，直接缓解核心差评来源。",
    },
  ];
  if (v2.length > 0) {
    releases.push({
      version: "2.0",
      theme: "体验升级：内容丰富度与个性化",
      requirementIds: v2.map((_, i) => `req_${v1.length + i}`),
      rationale: "v2 处理需要更深产品改动的需求，提升留存与差异化竞争力。",
    });
  }

  return { requirements, releases };
}

function buildTests(reviews: ParsedReview[], prompt: string) {
  // Count requirements by scanning req_ ids OR the requirements followup array.
  const reqIds = extractIds(prompt, "req_");
  const reqCount = Math.max(reqIds.length, 1);
  const tests: any[] = [];
  for (let i = 0; i < reqCount; i++) {
    const reviewSlice = reviews.slice(i * 2, i * 2 + 2).map((r) => r.id);
    tests.push({
      title: `回归测试：${labelForFinding(i)} 场景下不应复现用户报告的问题`,
      requirementId: `req_${i}`,
      steps: [
        `在最新构建中登录并进入对应功能入口（参见需求 req_${i}）。`,
        `按评论 ${reviewSlice[0] ?? ""} 描述的场景执行操作流程。`,
        `验证应用不崩溃、不出现错误提示、关键路径正常完成。`,
        `检查订阅/付费相关文案与按钮是否符合需求 ${reqIds[i] ?? `req_${i}`} 的验收标准。`,
      ],
      expectedResult: `用户在场景 ${reviewSlice.join(", ")} 下不再遇到原始问题；关键路径成功率 100%；无新增回归缺陷。`,
      type: i === 0 ? "smoke" : "regression",
      reviewIds: reviewSlice,
    });
  }
  return { testCases: tests };
}

function buildTraceability(prompt: string) {
  const reqIds = extractIds(prompt, "req_");
  const testIds = extractIds(prompt, "test_");
  return {
    requirements: reqIds.map((id, i) => ({
      requirementId: id,
      status: (i === reqIds.length - 1 ? "assumption" : "ok") as "ok" | "assumption" | "untraced",
      reviews: [],
    })),
    testCases: testIds.map((id, i) => ({
      testCaseId: id,
      status: "ok" as "ok" | "assumption",
      reviews: [],
    })),
    unsupportedConclusions: [],
  };
}

// --- canned copy helpers ---

function labelForFinding(i: number): string {
  return [
    "订阅与付费流程透明度",
    "崩溃与稳定性",
    "视频播放体验",
    "内容丰富度",
    "整体留存与口碑",
  ][i] ?? "用户反馈主题";
}
function userPersonaFor(i: number): string {
  return ["新用户", "重度用户", "iOS 16 用户", "订阅用户", "回访用户"][i] ?? "用户";
}
function wishFor(i: number): string {
  return [
    "在订阅前清晰看到价格与续费规则",
    "应用在使用过程中不再崩溃",
    "视频流畅播放且语音教练可用",
    "有更多难度与教练可选",
    "能持续获得锻炼动力",
  ][i] ?? "对应问题得到解决";
}
function benefitFor(i: number): string {
  return [
    "降低订阅投诉与退订率",
    "提升日活与留存",
    "改善锻炼完成率",
    "提升内容差异化竞争力",
    "形成口碑传播",
  ][i] ?? "改善用户体验";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exposed for provenance metadata when mock mode is active. */
export const MOCK_PROVENANCE = {
  provider: MOCK_PROVIDER,
  model: MOCK_MODEL,
  failureStrategy:
    "Mock mode (REVIEW_FORGE_MOCK_LLM=1): returns canned schema-valid responses. " +
    "Output references only real review ids parsed from the prompt. " +
    "Mock failures (schema validation, parse) still raise LlmError like real mode.",
  guards: [
    "Mock output is schema-validated with the same zod schemas as real mode.",
    "Mock only references review/topic/finding ids that exist in the prompt; the pipeline still post-validates and strips unknown ids.",
    "Mock is clearly labeled in provenance so it cannot be confused with real model-driven analysis.",
  ],
};
