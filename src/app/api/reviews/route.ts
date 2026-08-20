import { NextRequest, NextResponse } from "next/server";
import { fetchReviews } from "@/lib/appstore/rss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reviews?app=<url-or-id>&maxPages=10
 *
 * Standalone data-collection endpoint. Returns the raw fetched reviews
 * (plus cache status) without running the LLM pipeline. Useful for
 * inspecting what the collector actually retrieved.
 */
export async function GET(req: NextRequest) {
  const appRef = req.nextUrl.searchParams.get("app");
  const maxPages = Number(req.nextUrl.searchParams.get("maxPages") ?? "10");
  if (!appRef) {
    return NextResponse.json({ error: "Missing 'app' query parameter." }, { status: 400 });
  }
  try {
    const result = await fetchReviews(appRef, { maxPages: Number.isFinite(maxPages) ? maxPages : 10 });
    return NextResponse.json({
      appId: appRef,
      meta: result.meta,
      fromCache: result.fromCache,
      note: result.note,
      count: result.reviews.length,
      reviews: result.reviews,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
