"use client";

import { useState } from "react";

interface Props {
  onStart: (input: {
    appRef: string;
    goalText: string;
    appVersion?: string;
    maxRating?: number;
  }) => void;
  onReset: () => void;
  onImport: (file: File) => void;
  importedName: string | null;
  importedCount: number;
  onClearImport: () => void;
  importError: string | null;
  running: boolean;
}

const SAMPLE_URL =
  "https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684";

const GOAL_PRESETS: { label: string; text: string }[] = [
  { label: "整体诊断", text: "Analyze the app holistically: identify top user problems, opportunities, and prioritize fixes." },
  { label: "订阅转化", text: "Focus on subscription conversion: paywall friction, pricing complaints, trial-to-paid drop-off." },
  { label: "锻炼可用性", text: "Focus on workout usability: exercise flow, video playback, voice coaching, progress tracking." },
  { label: "低分差评", text: "Focus on 1-2 star reviews: find root causes of churn and complaints." },
];

export default function InputForm({
  onStart,
  onReset,
  onImport,
  importedName,
  importedCount,
  onClearImport,
  importError,
  running,
}: Props) {
  const [appRef, setAppRef] = useState(SAMPLE_URL);
  const [goalText, setGoalText] = useState(GOAL_PRESETS[0].text);
  const [appVersion, setAppVersion] = useState("");
  const [maxRating, setMaxRating] = useState<number | "">("");

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = "";
  };

  const start = () => {
    onStart({
      appRef: appRef.trim(),
      goalText: goalText.trim(),
      appVersion: appVersion.trim() || undefined,
      maxRating: maxRating === "" ? undefined : Number(maxRating),
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60">
            App Store 链接或 App ID
          </label>
          <input
            type="url"
            value={appRef}
            onChange={(e) => setAppRef(e.target.value)}
            placeholder="https://apps.apple.com/us/app/.../id839285684"
            className="w-full rounded-lg border border-white/15 bg-ink-soft/60 px-3 py-2 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <p className="mt-1.5 text-xs text-white/40">
            评测数据始终从 US 商店拉取 (题目要求)。支持 apps.apple.com 链接或纯数字 ID。
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60">
            分析目标 (可选)
          </label>
          <textarea
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-white/15 bg-ink-soft/60 px-3 py-2 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            placeholder="例: 关注订阅转化率与 v7.3.0 的低评分评价"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GOAL_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setGoalText(p.text)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70 transition hover:border-accent/60 hover:text-white"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60">
              限定版本 (可选)
            </label>
            <input
              type="text"
              value={appVersion}
              onChange={(e) => setAppVersion(e.target.value)}
              placeholder="如 7.3.0"
              className="w-full rounded-lg border border-white/15 bg-ink-soft/60 px-3 py-2 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60">
              评分上限 (可选)
            </label>
            <select
              value={maxRating}
              onChange={(e) => setMaxRating(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-white/15 bg-ink-soft/60 px-3 py-2 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
            >
              <option value="">不限</option>
              <option value="2">≤ 2 星</option>
              <option value="3">≤ 3 星</option>
              <option value="4">≤ 4 星</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/60">
            导入评测数据 (CSV / JSON，可选)
          </label>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-dashed border-white/20 bg-white/[0.04] px-3 py-2 text-xs text-white/70 transition hover:border-accent/60 hover:text-white">
              选择文件…
              <input type="file" accept=".csv,.json,application/json,text/csv" onChange={onFileChange} className="hidden" />
            </label>
            {importedName && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2 py-1 text-xs text-accent">
                {importedName} ({importedCount})
                <button onClick={onClearImport} className="text-accent/80 hover:text-white">×</button>
              </span>
            )}
          </div>
          {importError && (
            <p className="mt-1.5 text-xs text-red-300">{importError}</p>
          )}
          <p className="mt-1.5 text-xs text-white/40">
            导入会跳过 RSS 采集，直接进入清洗与 LLM 分析。CSV 表头: author,rating,title,content,version,isoDate
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={start}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-soft px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? (
            <>
              <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-white" />
              运行中…
            </>
          ) : (
            <>开始 ▶</>
          )}
        </button>
        {running && (
          <button
            onClick={onReset}
            className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/5"
          >
            中止
          </button>
        )}
      </div>
    </div>
  );
}
