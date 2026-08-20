"use client";

import type { AnalysisResult } from "@/lib/types";

interface Props {
  result: AnalysisResult;
}

export default function TopicsSection({ result }: Props) {
  const reviewsById = new Map(result.cleanReviews.map((r) => [r.id, r]));

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/60">
        主题由 Claude 基于 {result.cleanReviews.length} 条评论动态发现 (非预设分类)，
        每个主题列出所属评论 ID 以保证可追溯。
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {result.topics.map((t) => (
          <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">{t.label}</h3>
                <p className="mt-1 text-sm text-white/60">{t.description}</p>
              </div>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                t.sentiment === "positive" ? "bg-emerald-400/15 text-emerald-200"
                : t.sentiment === "negative" ? "bg-red-400/15 text-red-200"
                : "bg-amber-400/15 text-amber-200"
              }`}>
                {t.sentiment}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded bg-white/5 px-2 py-1">
                <div className="text-white/40">评论数</div>
                <div className="font-semibold">{t.reviewIds.length}</div>
              </div>
              <div className="rounded bg-white/5 px-2 py-1">
                <div className="text-white/40">均分</div>
                <div className="font-semibold">{t.avgRating.toFixed(1)}</div>
              </div>
              <div className="rounded bg-white/5 px-2 py-1">
                <div className="text-white/40">置信度</div>
                <div className="font-semibold">{(t.confidence * 100).toFixed(0)}%</div>
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-accent hover:underline">
                查看 {t.reviewIds.length} 条关联评论
              </summary>
              <ul className="mt-2 space-y-1.5">
                {t.reviewIds.slice(0, 10).map((id) => {
                  const r = reviewsById.get(id);
                  if (!r) return (
                    <li key={id} className="rounded bg-red-400/10 px-2 py-1 text-[11px] text-red-300">
                      {id} (未在清洗后数据中找到 — 已被剥离)
                    </li>
                  );
                  return (
                    <li key={id} className="rounded bg-white/[0.04] px-2 py-1 text-[11px]">
                      <span className="mr-1 font-mono text-white/40">{id}</span>
                      <span className="mr-1 text-white/50">{r.rating}★</span>
                      <span className="text-white/70">{r.title || r.content.slice(0, 80)}</span>
                    </li>
                  );
                })}
                {t.reviewIds.length > 10 && (
                  <li className="text-[11px] text-white/40">… 还有 {t.reviewIds.length - 10} 条</li>
                )}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
