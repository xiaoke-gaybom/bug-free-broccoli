# Review Forge — App Store 评测 → PRD → 测试用例

Vibe-coding demo：从一个真实的 iOS App Store 链接出发，自动完成
**数据采集 → 清洗去重 → 动态主题发现 → 问题整合 → PRD → 测试用例 → 可追溯性验证**
完整产品分析工作流，并通过可交互的网页界面展示执行进度与全部中间/最终交付物。

> 主要示例应用：[Workout for Women - Home Gym](https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684)
> 评测数据**始终**从美国 App Store 拉取（题目要求），即使你用 CN 商店链接打开应用详情页。

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（必须，用于模型驱动语义分析）

```bash
cp .env.example .env.local
# 编辑 .env.local，填入你的 ANTHROPIC_API_KEY
# 在 https://console.anthropic.com/ 获取密钥。真实密钥不会提交到仓库。
```

### 3. （可选）准备样本缓存数据

为方便面试官在**没有外网时**仍能查看结果，仓库可携带一份样本评论数据：

```bash
npm run seed
# → 抓取真实评论并写入 data/sample/reviews-us-839285684.json
```

样本数据有清晰的 `dataProvenance: "cache"` 标识；当外网 + 模型密钥可用时，系统**仍然会**
处理任何之前未见过的新输入（样本数据不会取代新鲜处理能力）。

### 4. 启动

```bash
npm run dev
# 打开 http://localhost:3000
```

界面顶部输入 App Store 链接（已预填示例链接），可选地填写分析目标 / 限定版本 / 限定评分上限，
点击「开始 ▶」即可看到工作流逐阶段执行，最终在标签页中查看所有交付物：
原始评论、清洗后评论、动态主题、整合发现、PRD、测试用例、可追溯性报告、模型溯源。

### 5. 离线 Mock 模式（无需 API Key / 无需网络）

如果你想在**没有 Anthropic API Key、没有外网**的情况下端到端验证整条流水线，
可以使用 Mock 模式。Mock 会用一个离线响应器替代 Claude，返回 **schema 合法**
且引用**真实评论 ID** 的结构化输出，并在溯源元数据中明确标记为 `Mock (offline)`，
绝不会被误认为真实模型分析。

```bash
# 方式 A：跑命令行端到端测试（推荐，最快）
npm run test:mock
# → 加载 data/mock/reviews-mock.json (20 条精选评论)
# → 跑完 9 个阶段，打印主题/发现/PRD/测试用例/可追溯性摘要
# → 全量结果写入 data/mock/last-mock-result.json

# 方式 B：在 UI 上用 mock LLM 体验完整流程
npm run dev:mock
# → 打开 http://localhost:3000
# → 在输入框上传 data/mock/reviews-mock.json，点击「开始 ▶」
# → 工作流进度 + 所有结果标签页都会展示完整数据
```

Mock 模式也可通过 `.env.local` 中 `REVIEW_FORGE_MOCK_LLM=1` 持久开启。

---

## 数据来源说明（题目要求"不能仅靠抓取页面可见内容"）

本项目的评论数据来自 Apple 官方公开的 **customerreviews RSS feed**：

```
https://itunes.apple.com/us/rss/customerreviews/page=<n>/id=<appId>/sortBy=mostRecent/json
```

选择该方式的原因：

1. 这是 Apple 提供的**官方机器可读**评论端点，不是 HTML 页面爬取。
2. 公开、无需鉴权、是 iOS 分析社区的常用方案。
3. 我们**始终从美国商店** (`us`) 拉取（即使输入链接是 CN 商店），直接满足题目数据来源约束。
4. 限速保护：最多 10 页（Apple RSS 上限），页间 250ms 间隔，单请求 15s 超时。
5. 失败降级：XML 端点失败时尝试 JSON 端点；网络完全不可用时回落到样本数据，并在界面与 `caveats` 中明确说明。

应用元信息（trackName、seller、version、genres）来自 [iTunes Lookup API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)。

---

## 模型驱动的语义分析（题目 AI 要求）

本项目使用 **Anthropic Claude**（默认 `claude-3-5-sonnet-latest`）完成下列模型驱动任务，**绝不依赖固定关键词/正则/查找表**：

| 阶段 | 工具名 | 任务 |
|---|---|---|
| 主题发现 | `discover_topics` | 从数据**动态**生成 4-10 个主题（不预设分类） |
| 问题整合 | `consolidate_findings` | 整合为可执行发现，附带证据/置信度/矛盾证据 |
| PRD 草稿 | `draft_prd` | 生成可追溯到发现的需求 + 版本规划 |
| 测试用例 | `draft_tests` | 每条用例绑定一个需求 + 关联评论 |
| 可追溯性审计 | `verify_traceability` | 审核整条链路，标记 `ok/assumption/untraced` |

每一项模型发现都包括：来源评论 ID、支持样本量、置信度、矛盾证据（如有）。
**模型生成结论与确定性统计严格区分**（在 UI 中以 `model` / `stat` 标签呈现）。

### 减少幻觉与无据结论的措施

1. 强制 tool-use 模式 → 结构化、schema 校验的 JSON 输出。
2. 模型只能引用**输入批次中真实存在**的评论 ID；流水线对模型输出做后置校验，剥离任何未知 ID。
3. 每条发现必须给出置信度；< 0.5 在可追溯性报告中标记为 `assumption`。
4. 模型必须显式记录矛盾证据。
5. 失败策略：任一模型阶段失败 → 该阶段标记 `error` 并中止下游阶段（**绝不伪造**结果）。

模型溯源元数据（提供方、模型、各阶段 system prompt、配置、失败策略、幻觉防护措施）
在 UI「模型溯源」标签页中完整呈现。

---

## 导入 CSV / JSON 评测数据

题目要求支持从文档化的 CSV/JSON 格式导入评论数据，以便面试官测试**之前未见过的**数据集。

### CSV 格式（首行表头必须）

```csv
author,rating,title,content,version,isoDate,url,externalId
"Jane D",5,"Great app","Works perfectly for my morning routine.","7.3.0","2024-09-12T10:00:00Z",,
"John Q",2,"Crashes","Crashes on iPhone 12 after the latest update.","7.3.0","2024-09-13T08:30:00Z",,
```

### JSON 格式

```json
[
  { "author": "Jane D", "rating": 5, "title": "Great app", "content": "...", "version": "7.3.0", "isoDate": "2024-09-12T10:00:00Z" }
]
```

在 UI 上传文件后会跳过 RSS 采集，直接进入清洗与 LLM 流水线。
API 端点：`POST /api/import`（接受 `text/csv` 或 `application/json`）。

---

## 项目结构

```
.
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/route.ts    # SSE 流水线入口
│   │   │   ├── import/route.ts     # CSV/JSON 导入
│   │   │   └── reviews/route.ts    # 独立数据采集调试
│   │   ├── layout.tsx
│   │   ├── page.tsx                # 主入口
│   │   └── globals.css
│   ├── components/
│   │   ├── PipelineClient.tsx      # 顶层状态机
│   │   ├── InputForm.tsx           # 输入表单 + 文件上传
│   │   ├── StageTracker.tsx        # 工作流进度
│   │   ├── ResultsView.tsx         # 结果区标签导航
│   │   └── sections/               # 各交付物展示
│   └── lib/
│       ├── appstore/
│       │   ├── rss.ts              # 官方 RSS 数据采集
│       │   ├── cache.ts            # 文件缓存
│       │   └── parser.ts           # URL 解析 + 导入校验
│       ├── reviews/clean.ts        # 清洗/去重/统计 (确定性)
│       ├── llm/
│       │   ├── claude.ts           # Anthropic 客户端 + tool-use
│       │   └── prompts.ts          # 提示工程 + schema
│       ├── analysis/
│       │   ├── pipeline.ts         # 流水线编排
│       │   └── stages.ts           # 阶段辅助函数
│       └── types.ts                # 共享类型
├── scripts/seed.mjs                # 抓取样本数据
├── data/sample/                    # 提交的样本输出
└── .env.example
```

---

## 技术栈

- **Next.js 14** + React + TypeScript（全栈一体）
- **Tailwind CSS**（暗色 UI）
- **Anthropic Claude SDK**（`@anthropic-ai/sdk`，tool-use 强制结构化输出）
- **fast-xml-parser**（解析 RSS XML 回退端点）
- **zod**（schema 校验）

---

## 运行时行为注意

- 没有 `ANTHROPIC_API_KEY` 时，确定性阶段（采集、清洗、统计）照常运行；
  LLM 阶段会以清晰的错误信息中止，UI 在工作流进度与 caveats 中显示原因。
  流水线**绝不**伪造模型结果。
- 数据缓存命中时 `dataProvenance: "cache"`；导入数据时 `dataProvenance: "import"`；
  实时拉取时 `dataProvenance: "fresh"`。
- 题目强调：在评估时使用 AI 编码助手本身不满足 AI 要求。
  本项目在**运行时**调用 Claude 完成模型驱动语义分析。

---

## 评估标准对照

| 题目要求 | 实现位置 |
|---|---|
| 数据真实、可重复、说明来源与局限 | `src/lib/appstore/rss.ts` + `caveats` |
| 清洗/去重/分类合理 | `src/lib/reviews/clean.ts` (确定性) + 主题发现 (LLM) |
| 模型驱动语义分析、可推广到未见数据 | 5 个 tool-use 阶段 |
| 区分证据/统计/模型结论/不确定性/矛盾 | UI 标签 + `evidenceType` + `contradictions` |
| PRD 基于用户问题、明确边界/优先级/版本 | `draft_prd` |
| 测试用例覆盖 PRD 且可追溯到评论 | `draft_tests` + 可追溯性审计 |
| 界面清晰展示工作流 + 本地可运行 | Next.js 应用 |
| 不依赖特定应用硬编码 | 通用 URL 解析、通用提示、通用 CSV/JSON 导入 |
