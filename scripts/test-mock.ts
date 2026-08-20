// Standalone end-to-end test for the analysis pipeline using mock LLM.
//
// Runs without the dev server, without an Anthropic API key, and without
// network access — purely offline. Verifies that:
//   - the mock review dataset loads + cleans correctly
//   - all 5 LLM stages produce schema-valid output (via the mock responder)
//   - the traceability chain stays intact end-to-end
//   - provenance correctly reports the Mock provider
//
// Usage:  npm run test:mock
// (or)    node --import tsx scripts/test-mock.ts

// Force mock mode BEFORE the pipeline calls runTool. The env var is read at
// call-time (inside runTool), so setting it here before main() runs is enough.
process.env.REVIEW_FORGE_MOCK_LLM = "1";

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { runPipeline } from "../src/lib/analysis/pipeline";
import { parseAppRef } from "../src/lib/appstore/parser";

interface MockDataset {
  meta: {
    trackName?: string;
    sellerName?: string;
    version?: string;
    genres?: string[];
    description?: string;
  };
  reviews: Array<{
    id: string;
    author: string;
    rating: number;
    title: string;
    content: string;
    version?: string;
    isoDate: string;
    source?: string;
  }>;
}

async function main() {
  console.log("=".repeat(72));
  console.log("Review Forge — end-to-end mock test");
  console.log("=".repeat(72));
  console.log("REVIEW_FORGE_MOCK_LLM =", process.env.REVIEW_FORGE_MOCK_LLM);
  console.log("ANTHROPIC_API_KEY     =", process.env.ANTHROPIC_API_KEY ? "(set, ignored in mock mode)" : "(unset, OK in mock mode)");
  console.log();

  // 1. Load the mock dataset.
  const mockPath = path.join(process.cwd(), "data", "mock", "reviews-mock.json");
  const raw = await readFile(mockPath, "utf8");
  const dataset = JSON.parse(raw) as MockDataset;
  console.log(`[load]   mock reviews: ${dataset.reviews.length}`);
  console.log(`[load]   app meta:    ${dataset.meta.trackName ?? "(none)"}`);
  console.log();

  // 2. Build the analysis input. We pass reviews as importedReviews so the
  //    pipeline skips RSS fetching entirely (no network needed).
  const ref = parseAppRef("https://apps.apple.com/us/app/id839285684");
  const importedReviews = dataset.reviews.map((r) => ({ ...r, source: r.source ?? "mock" }));

  const stageLog: { id: string; label: string; status: string; note?: string; count?: number }[] = [];
  const result = await runPipeline({
    appRef: ref.canonicalUrl,
    goal: {
      text: "Holistic analysis: identify top user problems, plan fixes, generate traceable test cases.",
    },
    importedReviews,
    hooks: {
      onStageUpdate: (s) => {
        stageLog.push({
          id: s.id,
          label: s.label,
          status: s.status,
          note: s.note,
          count: s.count,
        });
        const tag = s.status.toUpperCase().padEnd(7);
        const count = typeof s.count === "number" ? ` [${s.count}]` : "";
        const note = s.note ? ` — ${s.note}` : s.error ? ` — ERR: ${s.error}` : "";
        console.log(`  ${tag} ${s.label}${count}${note}`);
      },
    },
  });

  console.log();
  console.log("=".repeat(72));
  console.log("Stage summary");
  console.log("=".repeat(72));
  for (const s of result.stages) {
    const status = s.status.padEnd(8);
    console.log(`  ${status} ${s.label}${typeof s.count === "number" ? ` (${s.count})` : ""}${s.note ? ` — ${s.note}` : ""}${s.error ? ` — ERR: ${s.error}` : ""}`);
  }

  console.log();
  console.log("=".repeat(72));
  console.log("Result summary");
  console.log("=".repeat(72));
  console.log(`  appId:            ${result.appId}`);
  console.log(`  appUrl:           ${result.appUrl}`);
  console.log(`  trackName:        ${result.appMeta.trackName ?? "(none)"}`);
  console.log(`  seller:           ${result.appMeta.seller ?? "(none)"}`);
  console.log(`  latest version:   ${result.appMeta.version ?? "(none)"}`);
  console.log(`  raw reviews:      ${result.rawReviews.length}`);
  console.log(`  clean reviews:    ${result.cleanReviews.length}`);
  console.log(`  topics:           ${result.topics.length}`);
  console.log(`  findings:         ${result.findings.findings.length}`);
  console.log(`  requirements:     ${result.requirements.length}`);
  console.log(`  test cases:       ${result.testCases.length}`);
  console.log(`  releases:         ${result.releases.length}`);
  console.log(`  dataProvenance:   ${result.dataProvenance}`);
  console.log(`  llmProvider:      ${result.provenance.llmProvider}`);
  console.log(`  llmModel:         ${result.provenance.llmModel}`);
  console.log(`  caveats:          ${result.caveats.length}`);

  console.log();
  console.log("=".repeat(72));
  console.log("Topics (mock-generated)");
  console.log("=".repeat(72));
  for (const t of result.topics) {
    console.log(`  • [${t.sentiment.padEnd(8)}] ${t.label} — ${(t.confidence * 100).toFixed(0)}% — ${t.reviewIds.length} reviews — avg ${t.avgRating.toFixed(1)}★`);
    console.log(`    ${t.description}`);
    console.log(`    review ids: ${t.reviewIds.slice(0, 5).join(", ")}${t.reviewIds.length > 5 ? ` … +${t.reviewIds.length - 5}` : ""}`);
  }

  console.log();
  console.log("=".repeat(72));
  console.log("Findings (mock-generated, with evidence)");
  console.log("=".repeat(72));
  for (const f of result.findings.findings) {
    console.log(`  • ${f.title} [${f.evidenceType}] — conf ${(f.confidence * 100).toFixed(0)}% — n=${f.sampleSize}`);
    console.log(`    ${f.summary.slice(0, 140)}${f.summary.length > 140 ? "…" : ""}`);
    console.log(`    reviews: ${f.reviewIds.slice(0, 4).join(", ")}${f.reviewIds.length > 4 ? ` … +${f.reviewIds.length - 4}` : ""}`);
    if (f.contradictions) {
      console.log(`    ⚠ contradiction: ${f.contradictions.summary} (${f.contradictions.reviewIds.join(", ")})`);
    }
  }

  console.log();
  console.log("=".repeat(72));
  console.log("PRD (mock-generated, traceable to findings)");
  console.log("=".repeat(72));
  for (const r of result.requirements) {
    console.log(`  • [${r.priority}] v${r.targetVersion} ${r.title}  (${r.id})`);
    console.log(`    story: ${r.userStory.slice(0, 120)}${r.userStory.length > 120 ? "…" : ""}`);
    console.log(`    findings: ${r.findingIds.join(", ")}  →  reviews traceable via findings`);
    if (r.assumptions?.length) {
      console.log(`    assumptions: ${r.assumptions.join("; ")}`);
    }
  }
  console.log();
  console.log("Release plan:");
  for (const rel of result.releases) {
    console.log(`  v${rel.version} — ${rel.theme} (${rel.requirementIds.length} reqs)`);
  }

  console.log();
  console.log("=".repeat(72));
  console.log("Test cases (mock-generated, traceable to requirements + reviews)");
  console.log("=".repeat(72));
  for (const tc of result.testCases) {
    console.log(`  • [${tc.type}] ${tc.title}`);
    console.log(`    verifies: ${tc.requirementId}`);
    console.log(`    reviews:  ${tc.reviewIds.join(", ")}`);
    console.log(`    expect:   ${tc.expectedResult.slice(0, 100)}…`);
  }

  console.log();
  console.log("=".repeat(72));
  console.log("Traceability audit");
  console.log("=".repeat(72));
  const okReq = result.traceability.requirements.filter((r) => r.status === "ok").length;
  const assumeReq = result.traceability.requirements.filter((r) => r.status === "assumption").length;
  const untracedReq = result.traceability.requirements.filter((r) => r.status === "untraced").length;
  const okTc = result.traceability.testCases.filter((t) => t.status === "ok").length;
  const assumeTc = result.traceability.testCases.filter((t) => t.status === "assumption").length;
  console.log(`  requirements: ${okReq} ok, ${assumeReq} assumption, ${untracedReq} untraced`);
  console.log(`  test cases:   ${okTc} ok, ${assumeTc} assumption`);
  console.log(`  unsupported conclusions: ${result.traceability.unsupportedConclusions.length}`);

  console.log();
  console.log("=".repeat(72));
  console.log("Caveats");
  console.log("=".repeat(72));
  for (const c of result.caveats) {
    console.log(`  • ${c}`);
  }

  // Write the full result to disk for inspection.
  const outPath = path.join(process.cwd(), "data", "mock", "last-mock-result.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log();
  console.log(`Full result written to: ${outPath}`);

  // Final verdict.
  console.log();
  console.log("=".repeat(72));
  const allStagesOk = result.stages.every((s) => s.status === "done" || s.status === "skipped");
  const hasTrace = result.topics.length > 0 && result.findings.findings.length > 0 && result.requirements.length > 0 && result.testCases.length > 0;
  if (allStagesOk && hasTrace && result.provenance.llmProvider.startsWith("Mock")) {
    console.log("✅ PASS — pipeline ran end-to-end with mock LLM; traceability chain intact.");
    process.exit(0);
  } else {
    console.log("❌ FAIL — pipeline did not complete cleanly. See stages above.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Mock test crashed:", err);
  process.exit(1);
});
