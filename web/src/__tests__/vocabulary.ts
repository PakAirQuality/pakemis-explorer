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

/**
 * The dataset's own name. It belongs to the citation, the Downloads identity table, the API
 * examples and the receipts — never to the interface chrome, which carries the initiative's
 * name instead ("Pakistan Air Quality Initiative") and calls the assistant "Ask about this
 * view". __tests__/naming.test.tsx asserts both halves of that rule.
 */
export const DATASET_NAME = "PakEmis";

/** The initiative, whose name the chrome carries. */
export const INITIATIVE_NAME = "Pakistan Air Quality Initiative";

/** The assistant's name in the chrome: on the FAB, the nav button, the dock's header. */
export const ASK_LABEL = "Ask about this view";

/** Whether a rendered text names the dataset (case-insensitively, so "pakemis" is caught too). */
export function namesDataset(text: string): boolean {
  return text.toLowerCase().includes(DATASET_NAME.toLowerCase());
}
