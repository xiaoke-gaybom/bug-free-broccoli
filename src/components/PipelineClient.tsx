"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { AnalysisResult, PipelineStage, RawReview } from "@/lib/types";
import InputForm from "./InputForm";
import StageTracker from "./StageTracker";
import ResultsView from "./ResultsView";

type ViewState =
  | { kind: "idle" }
  | { kind: "running"; stages: PipelineStage[]; partial?: AnalysisResult }
  | { kind: "done"; result: AnalysisResult }
  | { kind: "error"; message: string; partial?: AnalysisResult };

export default function PipelineClient() {
  const [view, setView] = useState<ViewState>({ kind: "idle" });
  const [importedReviews, setImportedReviews] = useState<RawReview[] | null>(null);
  const [importedName, setImportedName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onImport = useCallback(async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": file.name.endsWith(".json") ? "application/json" : "text/csv" },
        body: text,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "import failed" }));
        throw new Error(err.error || `import failed (${res.status})`);
      }
      const data = await res.json();
      setImportedReviews(data.reviews as RawReview[]);
      setImportedName(file.name);
    } catch (err) {
      setImportError((err as Error).message);
      setImportedReviews(null);
      setImportedName(null);
    }
  }, []);

  const onStart = useCallback(
    async (input: { appRef: string; goalText: string; appVersion?: string; maxRating?: number }) => {
      setView({ kind: "running", stages: [] });
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appRef: input.appRef,
            goal: {
              text: input.goalText,
              appVersion: input.appVersion,
              maxRating: input.maxRating,
            },
            importedReviews: importedReviews ?? undefined,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: "request failed" }));
          throw new Error(err.error || `analyze failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let stages: PipelineStage[] = [];
        let finalResult: AnalysisResult | undefined;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by \n\n
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const ev of events) {
            const lines = ev.split("\n");
            let event = "message";
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
            }
            const dataStr = dataLines.join("\n");
            const data = dataStr ? JSON.parse(dataStr) : {};
            if (event === "stage") {
              const stage = data as PipelineStage;
              stages = mergeStage(stages, stage);
              setView({ kind: "running", stages: [...stages] });
            } else if (event === "result") {
              finalResult = data as AnalysisResult;
            } else if (event === "error") {
              throw new Error(data.message ?? "unknown error");
            }
          }
        }

        if (finalResult) {
          setView({ kind: "done", result: finalResult });
        } else {
          // Stream ended without a result event.
          setView({
            kind: "error",
            message: "Pipeline ended without producing a result.",
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setView({ kind: "idle" });
          return;
        }
        setView({ kind: "error", message: (err as Error).message });
      } finally {
        abortRef.current = null;
      }
    },
    [importedReviews],
  );

  const onReset = useCallback(() => {
    abortRef.current?.abort();
    setView({ kind: "idle" });
  }, []);

  const onClearImport = useCallback(() => {
    setImportedReviews(null);
    setImportedName(null);
    setImportError(null);
  }, []);

  const headerStats = useMemo(() => {
    if (view.kind !== "done" && view.kind !== "running") return null;
    const result = view.kind === "done" ? view.result : view.partial;
    if (!result) return null;
    return {
      reviews: result.cleanReviews.length,
      topics: result.topics.length,
      findings: result.findings.findings.length,
      requirements: result.requirements.length,
      testCases: result.testCases.length,
    };
  }, [view]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-accent-soft shadow-lg shadow-accent/30" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Review Forge</h1>
            <p className="text-sm text-white/60">
              App Store 评测 → 主题发现 → PRD → 测试用例 · vibe coding demo
            </p>
          </div>
        </div>
      </header>

      <InputForm
        onStart={onStart}
        onReset={onReset}
        onImport={onImport}
        importedName={importedName}
        importedCount={importedReviews?.length ?? 0}
        onClearImport={onClearImport}
        importError={importError}
        running={view.kind === "running"}
      />

      {view.kind === "running" && (
        <div className="mt-6">
          <StageTracker stages={view.stages} />
        </div>
      )}

      {view.kind === "error" && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <div className="font-semibold text-red-300">运行出错</div>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-red-200">{view.message}</pre>
        </div>
      )}

      {view.kind === "done" && (
        <div className="mt-6">
          <ResultsView result={view.result} stats={headerStats} />
        </div>
      )}

      <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/40">
        <p>
          评审数据来自 Apple 官方 customerreviews RSS feed (US 商店)；语义分析由
          Anthropic Claude 驱动；密钥通过环境变量配置，从不提交。
        </p>
      </footer>
    </div>
  );
}

function mergeStage(stages: PipelineStage[], stage: PipelineStage): PipelineStage[] {
  const idx = stages.findIndex((s) => s.id === stage.id);
  if (idx === -1) return [...stages, stage];
  const copy = stages.slice();
  copy[idx] = { ...copy[idx], ...stage };
  return copy;
}
