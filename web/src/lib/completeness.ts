/**
 * Which not-estimated (NE) rows of `get_completeness` belong to a sector. The completeness
 * ledger names IPCC codes ("3.D", "1.A.4.b", "(air)", "LU"); a module's streams
 * (`get_evidence(module)`) name theirs. The energy sector (1.A.*) is split across modules, so
 * an energy code matches exactly or by its own children; the fugitive family (1.B) and the
 * non-energy sectors (2, 3, 4) match by their family. Nothing here is arithmetic on a value:
 * it selects rows, and the page counts them.
 */
export type CodedCell = { ipcc_code?: string; code?: string; [k: string]: unknown };

/** The codes a module's evidence cells carry, split where a stream names two ("1.A.2/1.A.4.c"). */
export function sectorCodes(cells: CodedCell[]): string[] {
  const out = new Set<string>();
  for (const c of cells) for (const code of String(c.ipcc_code ?? "").split("/")) if (code.trim()) out.add(code.trim());
  return Array.from(out).sort();
}

/** The prefix a code matches NE rows by: energy codes as they are, 1.B as the family, other sectors by their top level. */
export function matchPrefix(code: string): string {
  if (code.startsWith("1.A.")) return code;
  if (code.startsWith("1.B")) return "1.B";
  return code.split(".")[0];
}

export function codeMatches(neCode: string, codes: string[]): boolean {
  const c = neCode.trim();
  return codes.some((code) => {
    const p = matchPrefix(code);
    return c === p || c.startsWith(`${p}.`);
  });
}

/** The NE rows of a completeness envelope that fall under a module's codes. */
export function neRowsFor<T extends CodedCell>(cells: T[], codes: string[]): T[] {
  if (!codes.length) return [];
  return cells.filter((c) => codeMatches(String(c.code ?? c.ipcc_code ?? ""), codes));
}

/** "3": the IPCC sector number a module's codes sit under (the first token of its first code). */
export function ipccSectorNumber(codes: string[]): string {
  const first = codes[0] ?? "";
  return first.split(".")[0] ?? "";
}
