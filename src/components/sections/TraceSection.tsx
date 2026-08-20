"use client";

import type { AnalysisResult } from "@/lib/types";

interface Props {
  result: AnalysisResult;
}

export default function TraceSection({ result }: Props) {
  const { requirements, testCases, unsupportedConclusions } = result.traceability;
  const reqsById = new Map(result.requirements.map((r) => [r.id, r]));
  const testsById = new Map(result.testCases.map((t) => [t.id, t]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60">
        可追溯性审计: 评论 → 发现 → 需求 → 测试用例的整条链路是否每一段都有证据支撑。
        标记为 &quot;假设&quot; 的链路证据较弱 (&lt; 2 条评论或置信度 &lt; 0.5)；&quot;未追溯&quot; 的需求无任何评论支撑。
      </p>

      {unsupportedConclusions.length > 0 && (
        <div className="rounded-xl border border-red-400/40 bg-red-400/10 p-4">
          <h3 className="font-semibold text-red-200">无证据支撑的结论</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-100">
            {unsupportedConclusions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
          <p className="mt-2 text-xs text-red-200/70">
            上述结论已被记录；如有需要应在最终交付物中删除或明确标记为假设。
          </p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">需求追溯</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-soft/80">
              <tr className="text-white/60">
                <th className="px-3 py-2 font-medium">需求</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">关联评论</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((row) => {
                const req = reqsById.get(row.requirementId);
                return (
                  <tr key={row.requirementId} className="border-t border-white/5">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white/90">{req?.title ?? row.requirementId}</div>
                      <div className="font-mono text-[10px] text-white/40">{row.requirementId}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        row.status === "ok" ? "bg-emerald-400/15 text-emerald-200"
                        : row.status === "assumption" ? "bg-amber-400/15 text-amber-200"
                        : "bg-red-400/15 text-red-200"
                      }`}>
                        {row.status === "ok" ? "已验证" : row.status === "assumption" ? "假设" : "未追溯"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.reviews.length === 0 ? (
                        <span className="text-white/30">—</span>
                      ) : (
                        <span className="font-mono text-[10px] text-white/70">
                          {row.reviews.slice(0, 5).join(", ")}
                          {row.reviews.length > 5 ? ` … +${row.reviews.length - 5}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {requirements.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-white/40">无需求</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/70">测试用例追溯</h3>
        <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-soft/80">
              <tr className="text-white/60">
                <th className="px-3 py-2 font-medium">测试用例</th>
                <th className="px-3 py-2 font-medium">需求</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">关联评论</th>
              </tr>
            </thead>
            <tbody>
              {testCases.map((row) => {
                const tc = testsById.get(row.testCaseId);
                const req = reqsById.get(row.requirementId || tc?.requirementId || "");
                return (
                  <tr key={row.testCaseId} className="border-t border-white/5">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white/90">{tc?.title ?? row.testCaseId}</div>
                      <div className="font-mono text-[10px] text-white/40">{row.testCaseId}</div>
                    </td>
                    <td className="px-3 py-2 text-white/70">{req?.title ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        row.status === "ok" ? "bg-emerald-400/15 text-emerald-200"
                        : "bg-amber-400/15 text-amber-200"
                      }`}>
                        {row.status === "ok" ? "已验证" : "假设"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.reviews.length === 0 ? (
                        <span className="text-white/30">—</span>
                      ) : (
                        <span className="font-mono text-[10px] text-white/70">
                          {row.reviews.slice(0, 5).join(", ")}
                          {row.reviews.length > 5 ? ` … +${row.reviews.length - 5}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {testCases.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-white/40">无测试用例</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
