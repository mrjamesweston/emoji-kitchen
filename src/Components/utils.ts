import type { EmojiData, EmojiMetadata } from "./types.js";

let cachedMetadata: EmojiMetadata | null = null;

/**
 * Loads emoji metadata from the server (lazy-loaded to avoid blocking initial bundle).
 * Safe to call multiple times; subsequent calls resolve immediately with cached data.
 */
export async function loadMetadata(): Promise<void> {
  if (cachedMetadata) {
    return;
  }

  // Loaded via the `./public` directory and shipped with GitHub pages
  var res = await fetch(`${import.meta.env.BASE_URL}metadata.json`);
  if (!res.ok) {
    throw new Error(`Failed to load metadata: ${res.status}`);
  }

  cachedMetadata = (await res.json()) as EmojiMetadata;
  return;
}

/**
 * Converts an emoji codepoint into a printable emoji used for log statements
 */
export function toPrintableEmoji(emojiCodepoint: string): string {
  return String.fromCodePoint(
    ...emojiCodepoint.split("-").map((p) => parseInt(`0x${p}`)),
  );
}

/**
 * Converts an emoji codepoint into a static github reference image url
 */
export function getNotoEmojiUrl(emojiCodepoint: string): string {
  return `https://raw.githubusercontent.com/googlefonts/noto-emoji/main/2D/svg/emoji_u${emojiCodepoint
    .split("-")
    .filter((x) => x !== "fe0f")
    .map((x) => x.padStart(4, "0")) // Handle ©️ and ®️
    .join("_")}.svg`;
}

export function getEmojiData(emojiCodepoint: string): EmojiData {
  if (!cachedMetadata) {
    throw new Error("Metadata not loaded");
  }

  return cachedMetadata.data[emojiCodepoint];
}

export function getSupportedEmoji(): Array<string> {
  if (!cachedMetadata) {
    throw new Error("Metadata not loaded");
  }

  return cachedMetadata.knownSupportedEmoji;
}

/**
 * Searches the locally cached metadata for emoji matching a free-text query.
 *
 * This deliberately avoids the hosted backend.emojikitchen.dev search api: that
 * service only allows its own origin, so any other deployment gets a CORS
 * failure. Everything it searches over (alt text, keywords, category) already
 * ships in metadata.json, so the lookup is done in-process instead.
 *
 * Every whitespace-separated term must match, and results are ordered by how
 * direct the match is, falling back to gBoardOrder so ties stay stable.
 */
export function searchEmoji(query: string): Array<string> {
  if (!cachedMetadata) {
    throw new Error("Metadata not loaded. Call loadMetadata() first.");
  }

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  const matches: Array<{ emojiCodepoint: string; score: number }> = [];

  for (const emojiCodepoint of cachedMetadata.knownSupportedEmoji) {
    const emojiData = cachedMetadata.data[emojiCodepoint];
    if (!emojiData) {
      continue;
    }

    const alt = emojiData.alt.toLowerCase();
    const keywords = emojiData.keywords.map((k) =>
      k.toLowerCase().replace(/_/g, " "),
    );
    const categories = [emojiData.category, emojiData.subcategory]
      .filter((c): c is string => Boolean(c))
      .map((c) => c.toLowerCase());

    let score = 0;
    for (const term of terms) {
      const termScore = scoreTerm(term, alt, keywords, categories);
      if (termScore === null) {
        score = -1;
        break;
      }
      score += termScore;
    }

    if (score >= 0) {
      matches.push({ emojiCodepoint, score });
    }
  }

  return matches
    .sort(
      (a, b) =>
        a.score - b.score ||
        cachedMetadata!.data[a.emojiCodepoint].gBoardOrder -
          cachedMetadata!.data[b.emojiCodepoint].gBoardOrder,
    )
    .map((m) => m.emojiCodepoint);
}

/**
 * Ranks a single search term against one emoji, lower being a better match.
 * Returns null when the term does not match at all.
 */
function scoreTerm(
  term: string,
  alt: string,
  keywords: Array<string>,
  categories: Array<string>,
): number | null {
  if (alt === term) {
    return 0;
  }
  if (alt.startsWith(term)) {
    return 1;
  }
  if (keywords.some((k) => k === term)) {
    return 2;
  }
  if (alt.includes(term)) {
    return 3;
  }
  if (keywords.some((k) => k.startsWith(term))) {
    return 4;
  }
  if (keywords.some((k) => k.includes(term))) {
    return 5;
  }
  if (categories.some((c) => c.includes(term))) {
    return 6;
  }
  return null;
}
