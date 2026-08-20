"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/types";
import ReviewsSection from "./sections/ReviewsSection";
import TopicsSection from "./sections/TopicsSection";
import FindingsSection from "./sections/FindingsSection";
import PrdSection from "./sections/PrdSection";
import TestsSection from "./sections/TestsSection";
import TraceSection from "./sections/TraceSection";
import ProvenanceSection from "./sections/ProvenanceSection";

interface Props {
  result: AnalysisResult;
  stats: {
    reviews: number;
    topics: number;
    findings: number;
    requirements: number;
    testCases: number;
  } | null;
}

type TabId =
  | "reviews"
  | "topics"
  | "findings"
  | "prd"
  | "tests"
  | "trace"
  | "provenance";

const TABS: { id: TabId; label: string; badge?: (s: Props["stats"]) => number | undefined }[] = [
  { id: "reviews", label: "原始/清洗" },
  { id: "topics", label: "主题", badge: (s) => s?.topics },
  { id: "findings", label: "发现", badge: (s) => s?.findings },
  { id: "prd", label: "PRD", badge: (s) => s?.requirements },
  { id: "tests", label: "测试用例", badge: (s) => s?.testCases },
  { id: "trace", label: "可追溯性" },
  { id: "provenance", label: "模型溯源" },
];

export default function ResultsView({ result, stats }: Props) {
  const [tab, setTab] = useState<TabId>("reviews");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              {result.appMeta.trackName ?? `App ${result.appId}`}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
              {result.appMeta.seller && <span>开发商: {result.appMeta.seller}</span>}
              {result.appMeta.version && <span>最新版本: {result.appMeta.version}</span>}
              {result.appMeta.genres?.length && <span>类别: {result.appMeta.genres.join(", ")}</span>}
              <span>商店: {result.country.toUpperCase()}</span>
            </div>
            <a
              href={result.appUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-accent hover:underline"
            >
              {result.appUrl}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <Stat label="原始评论" value={result.rawReviews.length} />
            <Stat label="清洗后" value={result.cleanReviews.length} />
            <Stat label="主题" value={result.topics.length} />
            <Stat label="发现" value={result.findings.findings.length} />
            <Stat label="需求" value={result.requirements.length} />
            <Stat label="测试用例" value={result.testCases.length} />
            <Stat
              label="数据来源"
              value={
                result.dataProvenance === "fresh"
                  ? "实时"
                  : result.dataProvenance === "cache"
                  ? "缓存"
                  : "导入"
              }
            />
          </div>
        </div>
        {result.caveats.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
            <div className="mb-1 font-semibold">数据/局限性说明</div>
            <ul className="list-inside list-disc space-y-1">
              {result.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          const badge = t.badge ? t.badge(stats) : undefined;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-gradient-to-r from-accent to-accent-soft text-white shadow"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              {t.label}
              {typeof badge === "number" && (
                <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-white/10"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="fade-in">
        {tab === "reviews" && <ReviewsSection result={result} />}
        {tab === "topics" && <TopicsSection result={result} />}
        {tab === "findings" && <FindingsSection result={result} />}
        {tab === "prd" && <PrdSection result={result} />}
        {tab === "tests" && <TestsSection result={result} />}
        {tab === "trace" && <TraceSection result={result} />}
        {tab === "provenance" && <ProvenanceSection result={result} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
