"use client";

import type { AnalysisResult } from "@/lib/types";

interface Props {
  result: AnalysisResult;
}

export default function ProvenanceSection({ result }: Props) {
  const { provenance } = result;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">模型与提供方</h3>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-white/40">提供方</dt>
            <dd className="font-medium">{provenance.llmProvider}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-white/40">模型</dt>
            <dd className="font-mono">{provenance.llmModel}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">各阶段提示与配置</h3>
        <div className="mt-3 space-y-3">
          {provenance.prompts.length === 0 && (
            <p className="text-sm text-white/40">未调用任何模型阶段 (可能因密钥缺失或前置阶段失败)。</p>
          )}
          {provenance.prompts.map((p, i) => (
            <details key={i} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
              <summary className="cursor-pointer text-sm font-medium text-accent">
                阶段: {p.stage} · 工具: {p.toolName}
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40">配置</div>
                  <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 text-xs text-white/80">{JSON.stringify(p.config, null, 2)}</pre>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40">System prompt</div>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs text-white/70">{p.systemPrompt}</pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">失败处理策略</h3>
          <p className="mt-2 text-sm text-white/70">{provenance.failureStrategy}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">减少幻觉/无据结论的措施</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/70">
            {provenance.hallucinationGuards.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
            {provenance.hallucinationGuards.length === 0 && (
              <li className="text-white/40">未配置 (本运行未调用模型)。</li>
            )}
          </ul>
        </div>
      </div>

      {result.caveats.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-200">数据/局限性</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-100">
            {result.caveats.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
