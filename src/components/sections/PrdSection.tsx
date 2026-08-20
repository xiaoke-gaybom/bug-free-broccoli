"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/types";

interface Props {
  result: AnalysisResult;
}

export default function PrdSection({ result }: Props) {
  const [filterVersion, setFilterVersion] = useState<string>("all");
  const versions = Array.from(new Set(result.requirements.map((r) => r.targetVersion)));
  const filtered = filterVersion === "all"
    ? result.requirements
    : result.requirements.filter((r) => r.targetVersion === filterVersion);

  const findingsById = new Map(result.findings.findings.map((f) => [f.id, f]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">
        PRD 由 Claude 基于发现生成。每条需求都可追溯到发现 → 评论；版本规划与优先级一并呈现。
      </p>

      {result.releases.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">版本规划</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {result.releases.map((rel) => (
              <div key={rel.version} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm text-accent">v{rel.version}</div>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
                    {rel.requirementIds.length} 个需求
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium">{rel.theme}</div>
                <p className="mt-1 text-xs text-white/60">{rel.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/50">按版本筛选:</span>
        <button
          onClick={() => setFilterVersion("all")}
          className={`rounded px-2 py-0.5 text-xs ${filterVersion === "all" ? "bg-accent/20 text-white" : "bg-white/5 text-white/60 hover:text-white"}`}
        >
          全部
        </button>
        {versions.map((v) => (
          <button
            key={v}
            onClick={() => setFilterVersion(v)}
            className={`rounded px-2 py-0.5 text-xs font-mono ${filterVersion === v ? "bg-accent/20 text-white" : "bg-white/5 text-white/60 hover:text-white"}`}
          >
            v{v}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((req) => (
          <div key={req.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{req.title}</h3>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    req.priority === "P0" ? "bg-red-400/20 text-red-200"
                    : req.priority === "P1" ? "bg-amber-400/20 text-amber-200"
                    : "bg-white/10 text-white/60"
                  }`}>
                    {req.priority}
                  </span>
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                    v{req.targetVersion}
                  </span>
                  <span className="font-mono text-[10px] text-white/40">{req.id}</span>
                </div>
                <div className="mt-2 rounded-lg bg-white/[0.04] p-2 text-sm italic text-white/80">
                  {req.userStory}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">验收标准</div>
              <ol className="list-inside list-decimal space-y-1 text-sm text-white/80">
                {req.acceptanceCriteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">依据</div>
              <p className="text-sm text-white/70">{req.rationale}</p>
            </div>
            {req.assumptions && req.assumptions.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
                <div className="mb-0.5 font-semibold">假设</div>
                <ul className="list-inside list-disc space-y-0.5">
                  {req.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-3 text-xs">
              <span className="text-white/40">关联发现: </span>
              {req.findingIds.map((fid) => {
                const f = findingsById.get(fid);
                return (
                  <span key={fid} className="mr-1.5 inline-block rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                    {f ? f.title.slice(0, 40) : fid}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
