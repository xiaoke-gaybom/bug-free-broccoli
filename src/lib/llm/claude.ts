import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isMockMode, runMockTool, MOCK_PROVENANCE } from "./mock";

/**
 * Anthropic Claude client wrapper.
 *
 * Model-driven semantic analysis lives here. Each pipeline stage that needs
 * semantic understanding calls `runTool` with a JSON-schema tool definition;
 * the model is forced to return structured output, which we validate with zod.
 *
 * Hallucination guards (per the assignment's requirements):
 *  - Tool-use mode forces structured, schema-validated JSON output.
 *  - Every model claim must cite review ids that exist in the input batch;
 *    the pipeline post-validates this and strips ids not in the input set.
 *  - Confidence is required for every finding; below-threshold findings are
 *    flagged with `assumption` in the traceability report.
 *  - On API failure we surface a structured error and fall back to a
 *    deterministic stub rather than fabricating results.
 *
 * Mock mode (REVIEW_FORGE_MOCK_LLM=1): routes runTool to a canned offline
 * responder that still passes schema validation and references real review
 * ids — lets the full pipeline run end-to-end without an API key. Clearly
 * labeled in provenance so it is never confused with real model output.
 */

const PROVIDER = "Anthropic";
const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

export interface LlmConfig {
  apiKey?: string;
  model?: string;
  /** Sampling temperature. Lower = more deterministic. */
  temperature?: number;
  /** Max output tokens. */
  maxTokens?: number;
}

export interface LlmProvenance {
  llmProvider: string;
  llmModel: string;
  toolName: string;
  config: Record<string, unknown>;
  failureStrategy: string;
  hallucinationGuards: string[];
}

let cachedClient: Anthropic | null = null;

export function getClaudeClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export function getModelName(): string {
  return (process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL);
}

export interface RunToolInput {
  systemPrompt: string;
  userPrompt: string;
  toolName: string;
  /** A JSON schema describing the structured output the model must produce. */
  toolSchema: Record<string, unknown>;
  /** Optional pre-validation schema (zod) used to coerce + validate the result. */
  schema?: z.ZodTypeAny;
  maxTokens?: number;
  temperature?: number;
}

export interface RunToolResult<T> {
  data: T;
  raw: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}

/**
 * Run a single tool-use turn against Claude. Returns parsed + validated data.
 * Throws `LlmError` if the call fails or output is unparseable.
 *
 * Mock routing: if REVIEW_FORGE_MOCK_LLM=1, skip the network call entirely
 * and use the offline canned responder (still schema-validated).
 */
export async function runTool<T = unknown>(input: RunToolInput): Promise<RunToolResult<T>> {
  if (isMockMode()) {
    return runMockTool<T>(input);
  }

  const client = getClaudeClient();
  if (!client) {
    throw new LlmError(
      "ANTHROPIC_API_KEY is not configured. Set it in .env.local to enable model-driven semantic analysis.",
    );
  }

  const model = getModelName();
  const temperature = input.temperature ?? 0;
  const maxTokens = input.maxTokens ?? 4096;

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: input.systemPrompt,
      messages: [{ role: "user", content: input.userPrompt }],
      tools: [
        {
          name: input.toolName,
          description: "Return the structured analysis result for this stage.",
          input_schema: input.toolSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: input.toolName },
    });
  } catch (err) {
    throw new LlmError(`Claude API call failed: ${(err as Error).message}`);
  }

  // Find the tool_use block in the response content.
  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new LlmError("Claude response did not contain a tool_use block.");
  }

  const raw = JSON.stringify(toolUse.input);
  let data = toolUse.input as T;
  if (input.schema) {
    const parsed = input.schema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new LlmError(
        `Claude output failed schema validation: ${parsed.error.message}`,
      );
    }
    data = parsed.data as T;
  }

  const usage = response.usage
    ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
    : null;

  return { data, raw, usage };
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

/** Build provenance metadata for the final result object. */
export function buildProvenance(stage: string, toolName: string, systemPrompt: string, config: Record<string, unknown>): LlmProvenance {
  if (isMockMode()) {
    return {
      llmProvider: MOCK_PROVENANCE.provider,
      llmModel: MOCK_PROVENANCE.model,
      toolName,
      config,
      failureStrategy: MOCK_PROVENANCE.failureStrategy,
      hallucinationGuards: MOCK_PROVENANCE.guards,
    };
  }
  return {
    llmProvider: PROVIDER,
    llmModel: getModelName(),
    toolName,
    config,
    failureStrategy:
      "On API failure or schema validation failure, the stage raises an LlmError. " +
      "The pipeline catches it, marks the stage as 'error', records the message, and " +
      "the UI surfaces it. No fabricated results are emitted — downstream stages " +
      "that depend on the failed one are skipped rather than guessing.",
    hallucinationGuards: [
      "Tool-use mode forces structured, schema-validated JSON output.",
      "Model must cite review ids that exist in the input batch; the pipeline post-validates and strips unknown ids.",
      "Every finding requires a confidence value; below 0.4 is flagged as 'assumption' in the traceability report.",
      "Contradicting evidence must be explicitly noted per finding when present.",
    ],
  };
}
