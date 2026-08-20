"use client";

import type { PipelineStage } from "@/lib/types";

interface Props {
  stages: PipelineStage[];
}

const STATUS_STYLE: Record<PipelineStage["status"], string> = {
  pending: "border-white/10 bg-white/[0.02] text-white/40",
  running: "border-accent/60 bg-accent/10 text-white",
  done: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  error: "border-red-400/40 bg-red-400/10 text-red-200",
  skipped: "border-white/10 bg-white/[0.02] text-white/30 line-through",
};

const STATUS_DOT: Record<PipelineStage["status"], string> = {
  pending: "bg-white/30",
  running: "bg-accent pulse-dot",
  done: "bg-emerald-400",
  error: "bg-red-400",
  skipped: "bg-white/20",
};

export default function StageTracker({ stages }: Props) {
  const doneCount = stages.filter((s) => s.status === "done").length;
  const total = stages.length || 1;
  const progress = Math.round((doneCount / total) * 100);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
          工作流进度
        </h2>
        <span className="text-xs text-white/50">{progress}%</span>
      </div>
      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-soft transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ol className="space-y-1.5">
        {stages.map((s) => (
          <li
            key={s.id}
            className={`fade-in flex items-start gap-3 rounded-lg border px-3 py-2 ${STATUS_STYLE[s.status]}`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-70">
                  {s.status}
                </span>
              </div>
              {(s.note || s.error) && (
                <p className="mt-0.5 text-xs opacity-80 break-words">
                  {s.error ? `错误: ${s.error}` : s.note}
                </p>
              )}
              {typeof s.count === "number" && (
                <p className="mt-0.5 text-[11px] opacity-60">
                  产出 {s.count} 条记录
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
