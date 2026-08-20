import { z } from "zod";

/**
 * Parse an App Store URL or a raw app id into { appId, country }.
 *
 * Accepts:
 *  - https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684
 *  - https://apps.apple.com/cn/app/.../id839285684
 *  - 839285684 (raw numeric id)
 *
 * The assignment requires review data to come from the US App Store even when
 * the user opens the CN listing, so the parser exposes both `countryFromUrl`
 * (provenance) and a normalized `dataCountry` (always "us" for review fetch).
 */
export interface ParsedAppRef {
  appId: string;
  /** Country code parsed from the URL (e.g. "us", "cn"), or "us" by default. */
  countryFromUrl: string;
  /** Country used for fetching reviews — always "us" per the assignment. */
  dataCountry: string;
  /** Canonical app URL (US storefront). */
  canonicalUrl: string;
}

const APP_URL_RE = /apps\.apple\.com\/([a-z]{2})\/app\/[^/]+\/id(\d+)/i;

export function parseAppRef(input: string): ParsedAppRef {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty app reference.");
  }

  const urlMatch = trimmed.match(APP_URL_RE);
  if (urlMatch) {
    const countryFromUrl = urlMatch[1].toLowerCase();
    const appId = urlMatch[2];
    return {
      appId,
      countryFromUrl,
      dataCountry: "us",
      canonicalUrl: `https://apps.apple.com/us/app/id${appId}`,
    };
  }

  // Pure numeric id.
  if (/^\d+$/.test(trimmed)) {
    return {
      appId: trimmed,
      countryFromUrl: "us",
      dataCountry: "us",
      canonicalUrl: `https://apps.apple.com/us/app/id${trimmed}`,
    };
  }

  // Try to extract any "id<digits>" from a generic URL.
  const idOnly = trimmed.match(/id(\d+)/);
  if (idOnly) {
    return {
      appId: idOnly[1],
      countryFromUrl: "us",
      dataCountry: "us",
      canonicalUrl: `https://apps.apple.com/us/app/id${idOnly[1]}`,
    };
  }

  throw new Error(
    `Could not parse App Store reference "${trimmed}". Provide an https://apps.apple.com/<cc>/app/.../id<digits> URL or a numeric app id.`,
  );
}

/** Lightweight validation for imported review datasets. */
export const ImportedReviewSchema = z.object({
  author: z.string().min(1),
  // CSV parsers return everything as strings; coerce so "5" parses to 5.
  rating: z.coerce.number().min(1).max(5),
  title: z.string(),
  content: z.string().min(1),
  version: z.string().optional(),
  isoDate: z.string().optional(),
  url: z.string().optional(),
  externalId: z.string().optional(),
});
export type ImportedReview = z.infer<typeof ImportedReviewSchema>;
