"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/types";

interface Props {
  result: AnalysisResult;
}

export default function ReviewsSection({ result }: Props) {
  const [view, setView] = useState<"raw" | "clean">("clean");
  const [filter, setFilter] = useState("");

  const rows = view === "raw" ? result.rawReviews : result.cleanReviews;
  const filtered = filter
    ? rows.filter((r) =>
        `${r.title} ${r.content} ${r.author}`.toLowerCase().includes(filter.toLowerCase()),
      )
    : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-white/10 p-0.5">
          {(["clean", "raw"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-xs ${
                view === v ? "bg-accent/20 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {v === "clean" ? `清洗后 (${result.cleanReviews.length})` : `原始 (${result.rawReviews.length})`}
            </button>
          ))}
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索评论…"
          className="rounded-lg border border-white/15 bg-ink-soft/60 px-3 py-1.5 text-xs text-white outline-none focus:border-accent"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-ink-soft/80 backdrop-blur">
              <tr className="text-white/60">
                <th className="px-3 py-2 font-medium">评分</th>
                <th className="px-3 py-2 font-medium">版本</th>
                <th className="px-3 py-2 font-medium">作者</th>
                <th className="px-3 py-2 font-medium">标题/内容</th>
                <th className="px-3 py-2 font-medium">日期</th>
                <th className="px-3 py-2 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-t border-white/5 align-top hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.rating >= 4 ? "bg-emerald-400/20 text-emerald-200" : r.rating <= 2 ? "bg-red-400/20 text-red-200" : "bg-amber-400/20 text-amber-200"
                    }`}>
                      {r.rating}★
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-white/70">{r.version ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-white/70">{r.author}</td>
                  <td className="px-3 py-2 max-w-xl">
                    <div className="font-medium text-white/90">{r.title}</div>
                    <div className="mt-0.5 text-white/60 line-clamp-3">{r.content}</div>
                    {r.flags?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.flags.map((f: string) => (
                          <span key={f} className="rounded bg-amber-400/15 px-1 text-[10px] text-amber-200">{f}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-white/50">
                    {new Date(r.isoDate).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-white/40">{r.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-white/40">没有匹配的评论。</p>
      )}
    </div>
  );
}
