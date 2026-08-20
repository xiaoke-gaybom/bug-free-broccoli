import { NextRequest, NextResponse } from "next/server";
import { ImportedReviewSchema } from "@/lib/appstore/parser";
import type { RawReview } from "@/lib/types";
import { cleanReviews } from "@/lib/reviews/clean";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/import
 *
 * Accepts a CSV or JSON payload of reviews and returns normalized RawReview[]
 * ready to feed into /api/analyze as `importedReviews`. The analyze route
 * then runs the full LLM pipeline on the imported data — this lets interviewers
 * test the system with previously-unseen review datasets.
 *
 * CSV format (header row required):
 *   author,rating,title,content,version,isoDate,url,externalId
 *
 * JSON format: array of objects with the same fields.
 */
export async function POST(req: NextRequest) {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  const text = await req.text();

  let records: unknown[];
  try {
    if (contentType.includes("application/json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
      const parsed = JSON.parse(text);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      records = parseCsv(text);
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse input: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const reviews: RawReview[] = [];
  const errors: { row: number; error: string }[] = [];
  records.forEach((rec, i) => {
    const result = ImportedReviewSchema.safeParse(rec);
    if (!result.success) {
      errors.push({ row: i, error: result.error.message });
      return;
    }
    const r = result.data;
    reviews.push({
      id: `import_${i}_${hash(r.author + r.content)}`,
      externalId: r.externalId,
      author: r.author,
      rating: r.rating,
      title: r.title ?? "",
      content: r.content,
      version: r.version,
      isoDate: r.isoDate ?? new Date().toISOString(),
      url: r.url,
      source: "csv:import",
    });
  });

  if (reviews.length === 0) {
    return NextResponse.json(
      { error: "No valid reviews found in input.", errors },
      { status: 400 },
    );
  }

  // Quick deterministic preview so the UI can show what was parsed before
  // running the (potentially slow) LLM pipeline.
  const cleaned = cleanReviews(reviews);
  return NextResponse.json({
    reviews,
    preview: {
      total: reviews.length,
      errors,
      droppedDuplicates: cleaned.droppedDuplicate,
      ratingDistribution: cleaned.clean.reduce((acc, r) => {
        acc[String(r.rating)] = (acc[String(r.rating)] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
  });
}

function parseCsv(text: string): Record<string, string>[] {
  // Minimal RFC4180-ish CSV parser. Handles quoted fields with embedded
  // newlines and commas. Good enough for review imports.
  const rows: string[][] = [];
  let i = 0;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = rows[r][idx] ?? "";
    });
    out.push(obj);
  }
  return out;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
