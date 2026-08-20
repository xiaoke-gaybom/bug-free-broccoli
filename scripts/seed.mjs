// Fetch real App Store reviews for the demo app and write them to
// data/sample/reviews-us-839285684.json so interviewers can view results
// offline. Run with: node scripts/seed.mjs
//
// This script intentionally reuses the production fetcher so the sample data
// format matches the runtime cache format exactly.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Node 20+ provides a global fetch.

const APP_ID = "839285684";
const OUT = path.join(process.cwd(), "data", "sample", `reviews-us-${APP_ID}.json`);

const UA =
  "Mozilla/5.0 (compatible; ReviewForge-seed/1.0; pipeline-research)";

async function main() {
  console.log(`Fetching reviews for appId=${APP_ID} from US storefront...`);
  const reviews = [];
  let meta = {};
  const seen = new Set();

  // Lookup for metadata.
  try {
    const lookupRes = await fetch(
      `https://itunes.apple.com/lookup?id=${APP_ID}&country=us`,
      { headers: { "User-Agent": UA } },
    );
    if (lookupRes.ok) {
      const data = await lookupRes.json();
      const r = data?.results?.[0];
      if (r) {
        meta = {
          trackName: r.trackName,
          sellerName: r.sellerName,
          version: r.version,
          genres: r.genres,
          description: r.description,
          trackViewUrl: r.trackViewUrl,
        };
      }
    }
  } catch (err) {
    console.warn(`lookup failed: ${err.message}`);
  }

  for (let page = 1; page <= 10; page++) {
    const url = `https://itunes.apple.com/us/rss/customerreviews/page=${page}/id=${APP_ID}/sortBy=mostRecent/json`;
    let text = "";
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) {
        console.log(`  page ${page}: HTTP ${res.status}, stopping.`);
        break;
      }
      text = await res.text();
    } catch (err) {
      console.log(`  page ${page}: fetch failed: ${err.message}`);
      break;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log(`  page ${page}: JSON parse failed, stopping.`);
      break;
    }
    const entries = data?.feed?.entry;
    if (!entries) {
      console.log(`  page ${page}: no entries, stopping.`);
      break;
    }
    const list = Array.isArray(entries) ? entries : [entries];
    let added = 0;
    for (const e of list) {
      const rating = e?.["im:rating"];
      if (rating === undefined) continue; // skip app metadata entry
      const author = e?.author?.label ?? "anonymous";
      const content = e?.content?.label ?? "";
      const title = e?.title?.label ?? "";
      const version = e?.["im:version"]?.label;
      const isoDate = e?.updated?.label;
      const id = `r_${hash(author + content + (isoDate ?? ""))}`;
      if (seen.has(id)) continue;
      seen.add(id);
      reviews.push({
        id,
        externalId: e?.id?.label,
        author,
        rating: Number(rating),
        title,
        content,
        version,
        isoDate,
        source: "rss:us",
      });
      added++;
    }
    console.log(`  page ${page}: +${added} reviews (total ${reviews.length})`);
    if (reviews.length === 0 && page === 1) {
      console.log(`  page ${page}: empty result, stopping.`);
      break;
    }
    await sleep(250);
  }

  if (reviews.length === 0) {
    console.error("No reviews fetched. Check network or App Store RSS availability.");
    process.exit(1);
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ reviews, meta, fetchedAt: new Date().toISOString() }, null, 2));
  console.log(`\nWrote ${reviews.length} reviews to ${OUT}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
