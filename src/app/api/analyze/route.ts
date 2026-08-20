import { NextRequest } from "next/server";
import { runPipeline } from "@/lib/analysis/pipeline";
import type { AnalysisGoal, PipelineStage, RawReview } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/analyze
 *
 * Body: { appRef: string; goal: AnalysisGoal; importedReviews?: RawReview[] }
 *
 * Streams stage updates as SSE events, then emits a final `result` event with
 * the full AnalysisResult. Frontend uses fetch() + ReadableStream (POST with
 * SSE body) since EventSource can't POST.
 */
export async function POST(req: NextRequest) {
  let body: {
    appRef?: string;
    goal?: AnalysisGoal;
    importedReviews?: RawReview[];
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const appRef = (body.appRef ?? "").trim();
  if (!appRef && !body.importedReviews?.length) {
    return new Response(
      JSON.stringify({ error: "Provide either an App Store URL or imported reviews." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const goal: AnalysisGoal = body.goal ?? { text: "" };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      const hooks = {
        onStageUpdate: (stage: PipelineStage) => send("stage", stage),
      };

      try {
        const result = await runPipeline({
          appRef,
          goal,
          importedReviews: body.importedReviews,
          hooks,
        });
        send("result", result);
      } catch (err) {
        send("error", { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
