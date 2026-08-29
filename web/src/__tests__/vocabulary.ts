/**
 * The phrases the project does not use for itself, copied from the manuscript outline
 * (emissions/docs/essd_outline.md, "Vocabulary the manuscript uses, and avoids"). The explainer
 * and /about are asserted against this list.
 */
export const AVOID_PHRASES = ["official national inventory", "definitive", "complete inventory", "observed gridded emissions", "true national emissions", "live emissions system", "AI-derived"] as const;

/** The phrases of the list present in a text, case-insensitively. */
export function avoidPhrasesIn(text: string): string[] {
  const t = text.toLowerCase();
  return AVOID_PHRASES.filter((p) => t.includes(p.toLowerCase()));
}
