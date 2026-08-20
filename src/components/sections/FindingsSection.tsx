"use client";

import type { AnalysisResult } from "@/lib/types";

interface Props {
  result: AnalysisResult;
}

export default function FindingsSection({ result }: Props) {
  const reviewsById = new Map(result.cleanReviews.map((r) => [r.id, r]));
  const findings = result.findings.findings;

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/60">
        发现由 Claude 整合得出。每条发现都包含支持评论 ID、样本量、置信度，
        以及矛盾证据 (若有)。模型生成结论与确定性统计严格区分。
      </p>
      <div className="space-y-3">
        {findings.map((f) => (
          <div key={f.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{f.title}</h3>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-white/60">
                    {f.evidenceType === "model" ? "模型" : "统计"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/70">{f.summary}</p>
              </div>
              <ConfidenceBar value={f.confidence} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Metric label="样本量" value={f.sampleSize} />
              <Metric label="评论 ID" value={f.reviewIds.length} />
              <Metric label="主题关联" value={f.topicIds.length} />
              <Metric label="置信度" value={`${(f.confidence * 100).toFixed(0)}%`} />
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">评分分布</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const n = f.ratingDistribution[String(star)] ?? 0;
                  const pct = f.sampleSize ? Math.round((n / f.sampleSize) * 100) : 0;
                  return (
                    <div key={star} className="flex-1">
                      <div className="h-12 w-full rounded bg-white/5">
                        <div
                          className={`h-full ${star <= 2 ? "bg-red-400/60" : star === 3 ? "bg-amber-400/60" : "bg-emerald-400/60"}`}
                          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                        />
                      </div>
                      <div className="mt-1 text-center text-[10px] text-white/50">{star}★ ({n})</div>
                    </div>
                  );
                })}
              </div>
            </div>
            {f.contradictions && (
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
                <div className="mb-0.5 font-semibold">矛盾证据</div>
                <p>{f.contradictions.summary}</p>
                <div className="mt-1 font-mono text-[10px] text-amber-200/80">
                  {f.contradictions.reviewIds.join(", ")}
                </div>
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-accent hover:underline">
                查看 {f.reviewIds.length} 条支持评论
              </summary>
              <ul className="mt-2 space-y-1.5">
                {f.reviewIds.slice(0, 8).map((id) => {
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
              </ul>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-white/40">置信度</div>
      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 text-xs font-semibold">{pct}%</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-white/5 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
