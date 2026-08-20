"use client";

import type { AnalysisResult } from "@/lib/types";

interface Props {
  result: AnalysisResult;
}

export default function TestsSection({ result }: Props) {
  const reqsById = new Map(result.requirements.map((r) => [r.id, r]));
  const reviewsById = new Map(result.cleanReviews.map((r) => [r.id, r]));

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/60">
        测试用例由 Claude 生成，每条用例明确指向一个需求并关联到原始评论 ID，
        形成评论 → 发现 → 需求 → 测试用例的完整可追溯链。
      </p>
      <div className="space-y-3">
        {result.testCases.map((tc) => {
          const req = reqsById.get(tc.requirementId);
          return (
            <div key={tc.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{tc.title}</h3>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-white/60">
                      {tc.type}
                    </span>
                    <span className="font-mono text-[10px] text-white/40">{tc.id}</span>
                  </div>
                  {req && (
                    <div className="mt-1 text-xs">
                      <span className="text-white/40">验证需求: </span>
                      <span className="text-accent">{req.title}</span>
                      <span className="ml-2 text-white/40">({req.id})</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">步骤</div>
                  <ol className="list-inside list-decimal space-y-1 text-sm text-white/80">
                    {tc.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">预期结果</div>
                  <p className="rounded-lg bg-emerald-400/10 px-2 py-1 text-sm text-emerald-100">
                    {tc.expectedResult}
                  </p>
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-accent hover:underline">
                  查看 {tc.reviewIds.length} 条关联评论 (用于验证是否解决了用户问题)
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {tc.reviewIds.slice(0, 8).map((id) => {
                    const r = reviewsById.get(id);
                    if (!r) return (
                      <li key={id} className="rounded bg-red-400/10 px-2 py-1 text-[11px] text-red-300">
                        {id} (未找到 — 已被剥离)
                      </li>
                    );
                    return (
                      <li key={id} className="rounded bg-white/[0.04] px-2 py-1 text-[11px]">
                        <span className="mr-1 font-mono text-white/40">{id}</span>
                        <span className="mr-1 text-white/50">{r.rating}★</span>
                        <span className="text-white/70">{r.title || r.content.slice(0, 100)}</span>
                      </li>
                    );
                  })}
                  {tc.reviewIds.length > 8 && (
                    <li className="text-[11px] text-white/40">… 还有 {tc.reviewIds.length - 8} 条</li>
                  )}
                </ul>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
